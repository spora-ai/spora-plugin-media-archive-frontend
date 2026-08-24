<script setup lang="ts">
/**
 * MediaFilters — type/search pills plus the dashboard-style scope chip row.
 *
 * The scope chip row mirrors `spora-frontend/src/components/dashboard
 * /DashboardFilterChips.vue`: ALL / My Media / Group A / Group B / ...,
 * single-select, click-the-active-chip-to-clear. The principal list the
 * parent passes in `principals` came from `GET /principals/me`, which
 * carries the `type: 'user' | 'group'` discriminator — that's the only
 * thing that lets us label the user-principal as `My Media` instead of
 * the `Group #${id}` fallback. The previous shape (`scopes: number[]`)
 * collapsed that information and rendered the user-principal with a
 * misleading group label; the controller's intersection would still
 * filter correctly server-side, but the UI was lying about what was
 * selected.
 *
 * The component is purely presentational: it emits `update:scope` with
 * the chosen principal id (or `null` for ALL) and never touches the
 * API client. The parent owns the `load()` call.
 */
import { computed } from 'vue'
import { Image, FileAudio, FileVideo, FileText, Search, User, LayoutGrid, Users } from 'lucide-vue-next'
import type { MediaPrincipal, MediaType } from '../types'

type Scope = number | null

interface ScopeChip {
    /** Stable discriminator — `null` is ALL, a number is the principal id. */
    id: Scope
    /** Visible label. */
    label: string
    /** Lucide icon component for the chip's leading slot. */
    icon: typeof LayoutGrid
}

const props = defineProps<{
    type: MediaType | ''
    search: string
    /**
     * Full list of principals the caller can act as, as returned by
     * `GET /principals/me`. The `type` field drives the chip label —
     * `user` → "My Media", `group` → `groupLabels[p.id]` with a
     * `Group #${id}` fallback. Order matters: the user-principal
     * (`type=user`) is what the `My Media` chip picks out.
     */
    principals: MediaPrincipal[]
    selectedScope: Scope
    /**
     * Map of `groupPrincipalId → groupName`. Group rows come from
     * `GET /groups`, whose wire shape keys the principal id (not the
     * group id) — see `GroupDetailResource::toArray()` in spora-core.
     * Empty until the bootstrap fetch resolves; the chip row falls
     * back to `Group #${id}` while the lookup is in flight.
     */
    groupLabels: Record<number, string>
    /**
     * Optional display-name suffix for the user-principal chip.
     * Mirrors `DashboardFilterChips`'s `My Agents (${me.name})` —
     * when the host has the user's display name handy, we render
     * `My Media (${name})`, otherwise just `My Media`.
     */
    myMediaLabel?: string | null
}>()

const emit = defineEmits<{
    (event: 'update:type', value: MediaType | ''): void
    (event: 'update:search', value: string): void
    (event: 'update:scope', value: Scope): void
}>()

interface TypePill {
    value: MediaType | ''
    label: string
    icon: typeof Image
}

const pills: TypePill[] = [
    { value: '', label: 'All', icon: Search },
    { value: 'image', label: 'Images', icon: Image },
    { value: 'audio', label: 'Audio', icon: FileAudio },
    { value: 'video', label: 'Video', icon: FileVideo },
    { value: 'document', label: 'Documents', icon: FileText },
]

const selected = computed(() => props.type)

/**
 * ALL chip + one chip per principal. The user-principal is rendered
 * with the `My Media` label (no fallback) regardless of whether
 * `groupLabels` has an entry — the old code used `groupLabels[id]`
 * for every principal and silently demoted the user-principal to
 * `Group #${id}`, which is exactly the bug the user reported.
 */
const scopeChips = computed<ReadonlyArray<ScopeChip>>(() => {
    const out: ScopeChip[] = [{ id: null, label: 'All', icon: LayoutGrid }]
    const mySuffix = props.myMediaLabel !== null && props.myMediaLabel !== undefined && props.myMediaLabel !== ''
        ? ` (${props.myMediaLabel})`
        : ''
    for (const principal of props.principals) {
        if (principal.type === 'user') {
            out.push({
                id: principal.id,
                label: `My Media${mySuffix}`,
                icon: User,
            })
            continue
        }
        // group-principal
        const label = props.groupLabels[principal.id] ?? `Group #${principal.id}`
        out.push({
            id: principal.id,
            label,
            icon: Users,
        })
    }
    return out
})

function isScopeActive(id: Scope): boolean {
    return props.selectedScope === id
}

function onScopeClick(id: Scope): void {
    // Single-select: clicking the active chip resets to ALL so the
    // user can dismiss the filter in one click (matches the
    // dashboard's flag-chip toggle behaviour).
    if (isScopeActive(id)) {
        emit('update:scope', null)
        return
    }
    emit('update:scope', id)
}
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
            <div class="flex flex-wrap gap-2" data-testid="media-type-pills">
                <button
                    v-for="pill in pills"
                    :key="pill.value || 'all'"
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    :class="
                        selected === pill.value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    "
                    :data-testid="`media-type-${pill.value || 'all'}`"
                    @click="emit('update:type', pill.value)"
                >
                    <component :is="pill.icon" class="h-3.5 w-3.5" />
                    {{ pill.label }}
                </button>
            </div>
        </div>

        <div
            v-if="scopeChips.length > 1"
            class="flex flex-wrap items-center gap-2"
            data-testid="media-scope-chips"
        >
            <button
                v-for="chip in scopeChips"
                :key="`scope-${chip.id ?? 'all'}`"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                :class="
                    isScopeActive(chip.id)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                "
                :data-scope="chip.id ?? 'all'"
                :data-testid="`media-scope-${chip.id ?? 'all'}`"
                :aria-pressed="isScopeActive(chip.id)"
                @click="onScopeClick(chip.id)"
            >
                <component :is="chip.icon" class="h-3.5 w-3.5" />
                {{ chip.label }}
            </button>
        </div>

        <label class="relative block">
            <span class="sr-only">Search</span>
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                type="search"
                :value="search"
                aria-label="Search"
                placeholder="Search prompts and tags…"
                class="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="media-search"
                @input="emit('update:search', ($event.target as HTMLInputElement).value)"
            />
        </label>
    </div>
</template>
