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
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import type { PluginHostContext } from './shims'
import { createMockApi } from './dev-mock'

// One-line banner so the developer knows they're in sandbox mode and
// doesn't waste time wondering why their real backend isn't responding.
console.info('[spora/media-archive] dev sandbox — using in-memory fixtures (no backend)')

const hostContext: PluginHostContext = {
    api: createMockApi(),
    pinia: createPinia(),
    theme: 'light',
    route: { path: '/apps/media-archive', params: {}, query: {} },
    router: { push: () => undefined, replace: () => undefined },
}

const target = document.getElementById('app')
if (target) {
    const app = createApp(App, { hostContext })
    app.use(createPinia())
    app.config.globalProperties.$host = hostContext
    app.mount(target)
}