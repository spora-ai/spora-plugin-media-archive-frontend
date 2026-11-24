/**
 * useChatReferenceLookup — how many chats use the assets a deletion
 * would take away.
 *
 * Both delete paths use it: the bulk one in the grid and the single one
 * on the detail page. It owns the pending state, the deadline and the
 * stale-answer guard, so the two paths cannot drift apart.
 *
 * The lookup is best-effort. A failure — or a request that never comes
 * back — leaves the warning out rather than blocking the deletion; the
 * only thing the caller has to honour is the pending state, which ends
 * when the lookup settles either way.
 */
import { onScopeDispose, ref, type Ref } from 'vue'
import type { PluginHostContext } from '../shims'
import { chunkChatReferenceIds } from '../lib/chat-references'

/**
 * How long a lookup may run before the deletion stops waiting for it.
 *
 * A hung request must not leave the operator unable to delete anything,
 * so the lookup has a deadline: after it the answer counts as "nothing
 * found" and the deletion goes on.
 */
export const CHAT_REFERENCE_TIMEOUT_MS = 5000

export interface ChatReferenceLookup {
    /**
     * The counts per asset id. `null` while a lookup is running.
     */
    counts: Ref<Record<string, number> | null>
    /**
     * Whether a lookup is running.
     */
    pending: Ref<boolean>
    /**
     * The ids the running (or last) lookup was asked about.
     *
     * The warning is computed from these: the counts answer for the ids
     * that were asked about, not for the selection as it is now.
     */
    lookedUpIds: Ref<string[]>
    /**
     * Ask how many chats use each of the given ids.
     */
    lookup: (ids: string[]) => Promise<void>
    /**
     * Drop the answer and the pending state.
     *
     * The answer is about the ids it was asked about, so a caller that
     * drops the question — the confirmation is about another asset now —
     * drops the answer with it. The request in flight is invalidated:
     * its answer belongs to a question nobody asks any more.
     */
    reset: () => void
}

export function useChatReferenceLookup(api: Ref<PluginHostContext['api']>): ChatReferenceLookup {
    const counts = ref<Record<string, number> | null>(null)
    const pending = ref(false)
    const lookedUpIds = ref<string[]>([])

    /**
     * Monotonic guard against a stale answer: the dialog can be
     * reopened with a different selection before the first request comes
     * back, and only the latest answer may be used.
     */
    let requestId = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    function clearTimer(): void {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
    }

    onScopeDispose(clearTimer)

    async function lookup(ids: string[]): Promise<void> {
        clearTimer()
        counts.value = null
        lookedUpIds.value = [...ids]
        const myId = ++requestId
        if (ids.length === 0) {
            pending.value = false
            return
        }
        pending.value = true
        const myTimer = setTimeout(() => {
            if (timer === myTimer) timer = null
            // The answer is not coming. The deadline ends the wait, and
            // the request is invalidated so a late answer cannot land
            // on a later lookup.
            if (myId !== requestId) return
            requestId++
            pending.value = false
            counts.value = {}
        }, CHAT_REFERENCE_TIMEOUT_MS)
        timer = myTimer
        try {
            const responses = await Promise.all(
                chunkChatReferenceIds(ids).map((chunk) =>
                    api.value.post<{ counts?: Record<string, number> }>('/media/chat-references', {
                        ids: chunk,
                    }),
                ),
            )
            // The guard sits around the MERGED answer, not around a single
            // batch: a selection that needed several batches is answered
            // last, and the answer of the selection before it must not
            // land on this one.
            if (myId !== requestId) return
            const merged: Record<string, number> = {}
            for (const response of responses) {
                Object.assign(merged, response?.counts ?? {})
            }
            counts.value = merged
        } catch {
            if (myId !== requestId) return
            counts.value = {}
        } finally {
            // Only this lookup's own deadline may be cleared: a lookup
            // that is still in flight must not cancel the deadline of
            // the one that replaced it.
            if (timer === myTimer) {
                clearTimeout(myTimer)
                timer = null
            }
            if (myId === requestId) {
                pending.value = false
            }
        }
    }

    function reset(): void {
        clearTimer()
        requestId++
        counts.value = null
        lookedUpIds.value = []
        pending.value = false
    }

    return { counts, pending, lookedUpIds, lookup, reset }
}
