/**
 * Dev-only entry. Boots the same component tree as the production bundle
 * but renders it into `#app` instead of the host's plugin slot, with a
 * mock host context that lets the UI load data without a backend.
 *
 * The mock API + fixtures + helpers live in `./dev-mock` so they can
 * be unit-tested without triggering this bootstrap. The production
 * bundle (./main.ts) is unaffected.
 *
 * For end-to-end testing against a real backend, run the host dev flow:
 *   1. PHP at :8080 (`composer dev` in spora-local)
 *   2. Plugin dev at :5174 (`npm run dev` here)
 *   3. Host SPA at :5173 (`npm run dev` in spora-frontend)
 * The host's `vite.config.ts → SPORA_PLUGIN_DEV_PORTS` then forwards
 * `/api` to PHP and `/plugins/media-archive/*` to this dev server.
 */
import { createApp, ref } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import type { PluginHostContext } from './shims'
import { createMockApi } from './dev-mock'
import { createPluginI18n } from './i18n'

// One-line banner so the developer knows they're in sandbox mode and
// doesn't waste time wondering why their real backend isn't responding.
console.info('[spora/media-archive] dev sandbox — using in-memory fixtures (no backend)')

// `?locale=de` renders the panel in German without touching the code.
const locale = new URLSearchParams(location.search).get('locale') ?? 'en'

/**
 * A router that navigates.
 *
 * The panel reads the current path imperatively and subscribes to
 * `afterEach` — the host's router is a real one, and a no-op stub leaves
 * the sandbox unable to open an asset at all.
 */
const currentRoute = ref({ path: '/apps/media-archive' })
const afterEachCallbacks: Array<(to: { path: string }) => void> = []

const router = {
    push: async (to: string): Promise<void> => {
        const path = typeof to === 'string' ? to : String(to)
        currentRoute.value = { path }
        for (const callback of afterEachCallbacks) {
            callback({ path })
        }
    },
    currentRoute,
    afterEach: (callback: (to: { path: string }) => void): (() => void) => {
        afterEachCallbacks.push(callback)
        return () => {
            const index = afterEachCallbacks.indexOf(callback)
            if (index >= 0) afterEachCallbacks.splice(index, 1)
        }
    },
}

const hostContext: PluginHostContext = {
    api: createMockApi(),
    pinia: createPinia(),
    theme: 'light',
    locale,
    route: { path: currentRoute.value.path, params: {}, query: {} },
    router,
}

const target = document.getElementById('app')
if (target) {
    const app = createApp(App, { hostContext })
    app.use(createPinia())
    app.use(createPluginI18n(locale))
    app.config.globalProperties.$host = hostContext
    app.mount(target)
}