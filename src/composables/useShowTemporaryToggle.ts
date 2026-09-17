/**
 * useShowTemporaryToggle — localStorage-persisted boolean ref for the
 * "Include temporary files" toggle.
 *
 * The toggle is shared across three surfaces — `MediaFilters` (the UI
 * switch), `App.vue` (drives the `?include_temporary=` query param and
 * reloads the grid on flip), and `MediaCard` (decides whether to
 * render the Temporary corner badge). A module-scoped singleton ref
 * keeps the three in sync without prop-drilling.
 *
 * Persistence is keyed under `spora.media.showTemporary.v1` so a
 * future format change can bump to `v2` without colliding with
 * existing users' saved state. The `.v1` suffix is the convention
 * used elsewhere in the Spora codebase for versioned localStorage
 * keys (see `spora-frontend`'s theme + density toggles).
 *
 * `localStorage` access is wrapped because the composable may be
 * imported during SSR, inside a Safari private window (where
 * `setItem` throws), or in a test environment that doesn't provide
 * it. Failure to read or write is silently ignored — the in-memory
 * ref is the source of truth within a session, persistence is a
 * best-effort optimization.
 */
import { ref, watch, type Ref } from 'vue'

const STORAGE_KEY = 'spora.media.showTemporary.v1'

function readFromStorage(): boolean {
    if (typeof localStorage === 'undefined') return false
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw === null) return false
        return raw === 'true'
    } catch {
        return false
    }
}

function writeToStorage(value: boolean): void {
    if (typeof localStorage === 'undefined') return
    try {
        localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
    } catch {
        // ignore — private-mode browsers throw on setItem
    }
}

// Module-level singleton: every consumer reads/writes the same ref so
// a flip in `MediaFilters` instantly re-evaluates the `MediaCard`
// badge visibility and the `App.vue` watcher that reloads the grid.
const showTemporary = ref<boolean>(readFromStorage())

// Module-level side effect: persist every change. The watcher is
// registered once at module load (the `watch()` call lives outside
// `useShowTemporaryToggle`), so repeated calls to the composable
// reuse the same subscription and never stack new ones.
watch(showTemporary, (next) => {
    writeToStorage(next)
})

export interface ShowTemporaryToggle {
    showTemporary: Ref<boolean>
    setShowTemporary: (value: boolean) => void
    toggle: () => void
}

export function useShowTemporaryToggle(): ShowTemporaryToggle {
    return {
        showTemporary,
        setShowTemporary: (value) => {
            showTemporary.value = value
        },
        toggle: () => {
            showTemporary.value = !showTemporary.value
        },
    }
}

/**
 * Test-only helper: reset the singleton's value to the documented
 * default and remove the persisted entry. Production code never
 * calls this — `tests/setup.ts`-adjacent specs use it in `beforeEach`
 * so the toggle starts off regardless of which test ran first.
 */
export function __resetShowTemporaryToggleForTesting(): void {
    showTemporary.value = false
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.removeItem(STORAGE_KEY)
        } catch {
            // ignore
        }
    }
}