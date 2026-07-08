import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import type { PluginHostContext } from './shims'

/**
 * Plugin mount/unmount contract.
 *
 * The IIFE lib wrapper installs this on `window.SporaAppMediaArchive`.
 * The host's `apps/registry.ts` reads `window.SporaAppMediaArchive.mount`
 * and `unmount` and calls them when `/apps/media-archive` is mounted/unmounted.
 *
 * Important: the plugin uses a *local* Pinia instance. Plugin-only state
 * (filters, selection) lives here so it doesn't pollute the host's stores.
 * Host services (auth, theme) are reached via the passed-in `hostContext.pinia`
 * — see `useHostAuthStore` etc.
 *
 * `mount()` may be sync or async. The registry awaits the return value when
 * it looks like a thenable, so plugins can do async setup (config fetch,
 * initial data load) before returning.
 */
const SporaApp = {
    mount(target: HTMLElement, hostContext: PluginHostContext): void {
        const app = createApp(App, { hostContext })
        const localPinia = createPinia()
        app.use(localPinia)
        // Stash the host's Pinia on `globalProperties` so any component can
        // reach it via `this.$host.pinia` without polluting `provide`/`inject`
        // keys that the host also uses.
        app.config.globalProperties.$host = hostContext
        app.mount(target)
        // Keep a back-reference so `unmount` can find the right app even if
        // the host mounts the same bundle into multiple slots in the future.
        ;(target as HTMLElement & { __sporaApp?: { unmount: () => void } }).__sporaApp = {
            unmount: () => {
                app.unmount()
            },
        }
    },

    unmount(target: HTMLElement): void {
        const ref = (target as HTMLElement & { __sporaApp?: { unmount: () => void } }).__sporaApp
        if (ref) {
            ref.unmount()
            delete (target as HTMLElement & { __sporaApp?: { unmount: () => void } }).__sporaApp
        }
    },
}

// Vite's IIFE lib wrapper installs the value at `window.<lib.name>` when
// `build.lib.name = 'SporaAppMediaArchive'`. We additionally assign here
// for the dev-mode entry (which doesn't go through `vite build --lib`).
window.SporaAppMediaArchive = SporaApp

export default SporaApp