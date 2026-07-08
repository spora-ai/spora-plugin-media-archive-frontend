/**
 * The Media Archive SPA is mounted into a slot owned by the host's
 * `PluginAppPage.vue`. The host passes a deliberately small context:
 *   - `api`       — the host's typed REST client. We use it directly rather
 *                   than rebuilding a copy so request/response shapes stay
 *                   in sync with the host's `/api/v1` envelope.
 *   - `pinia`     — the host's Pinia instance. Plugins may install a
 *                   *local* Pinia (for plugin-only state) but should NOT
 *                   call `setActivePinia(host.pinia)` — that would collide
 *                   with the host's stores.
 *   - `theme`     — `'light' | 'dark'` snapshot at mount time. Plugins read
 *                   this once and trust it; if the host re-themes, the slot
 *                   is unmounted and remounted, so we get a fresh value.
 *   - `route`     — the host's current route. Plugins render under
 *                   `/apps/<slug>` already; this is for breadcrumbs and
 *                   back-links.
 *   - `router`    — the host's Vue Router instance. Plugins that need
 *                   client-side navigation call `router.push(...)`.
 *
 * Anything else (auth, runtime config, etc.) is reachable via the host's
 * Pinia stores — use `useSomeHostStore(host.pinia)` rather than reaching
 * for `useSomeHostStore()` directly, which would attach to whatever Pinia
 * is currently active in the slot.
 */
export interface PluginHostContext {
    api: {
        get: <T = unknown>(path: string) => Promise<{ data: T }>
        post: <T = unknown>(path: string, body: unknown) => Promise<{ data: T }>
        patch: <T = unknown>(path: string, body: unknown) => Promise<{ data: T }>
        delete: <T = unknown>(path: string) => Promise<{ data: T }>
    }
    pinia: unknown
    theme: 'light' | 'dark'
    route: unknown
    router: unknown
}

declare global {
    interface Window {
        SporaAppMediaArchive?: {
            mount: (target: HTMLElement, ctx: PluginHostContext) => void | Promise<void>
            unmount?: (target: HTMLElement) => void
        }
    }
}

export {}