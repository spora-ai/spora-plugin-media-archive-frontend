/**
 * Dev-only entry. Boots the same component tree as the production bundle
 * but renders it into `#app` instead of the host's plugin slot, with a
 * mock host context that lets the UI load data without a backend.
 *
 * The mock API mirrors the real `/api/v1/media` envelope shape so the
 * components behave identically in dev and prod — only the data source
 * differs.
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import type { MediaAsset, MediaListEnvelope } from './types'
import type { PluginHostContext } from './shims'

const FIXTURE: MediaAsset[] = [
    {
        id: 'demo-1',
        media_type: 'image',
        mime_type: 'image/png',
        byte_size: 12_345,
        width: 1024,
        height: 1024,
        duration_seconds: null,
        prompt: 'A serene alpine lake at golden hour',
        asset_url: 'https://placehold.co/600x400/png',
        source_url: 'https://example.com/cdn/foo.png',
        storage_mode: 'external',
        plugin_slug: 'minimax',
        tool_name: 'image',
        agent_id: 'a1',
        task_id: 't1',
        tool_call_id: 'tc1',
        created_at: new Date().toISOString(),
    },
    {
        id: 'demo-2',
        media_type: 'audio',
        mime_type: 'audio/mpeg',
        byte_size: 56_789,
        width: null,
        height: null,
        duration_seconds: 12.5,
        prompt: 'Welcome to the daily briefing',
        asset_url: 'https://placehold.co/600x400/mp3',
        source_url: null,
        storage_mode: 'local',
        plugin_slug: 'minimax',
        tool_name: 'speech',
        agent_id: 'a1',
        task_id: 't2',
        tool_call_id: 'tc2',
        created_at: new Date(Date.now() - 3600_000).toISOString(),
    },
]

const mockApi: PluginHostContext['api'] = {
    async get<T>(path: string): Promise<{ data: T }> {
        if (path.startsWith('/media/') && path !== '/media') {
            const id = path.slice('/media/'.length).split('?')[0]
            const found = FIXTURE.find((m) => m.id === id)
            if (!found) throw new Error(`Not found: ${id}`)
            return { data: { data: found } as T }
        }
        if (path.startsWith('/media')) {
            return {
                data: {
                    data: FIXTURE,
                    meta: { current_page: 1, per_page: 20, total: FIXTURE.length, last_page: 1 },
                } as T,
            }
        }
        throw new Error(`Mock API has no handler for ${path}`)
    },
    post: async () => {
        throw new Error('POST not supported in mock')
    },
    patch: async () => {
        throw new Error('PATCH not supported in mock')
    },
    delete: async () => {
        throw new Error('DELETE not supported in mock')
    },
}

const hostContext: PluginHostContext = {
    api: mockApi,
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

// Mark the unused-import linter happy — `MediaListEnvelope` is referenced
// implicitly via the mock shape; re-exporting keeps it discoverable for
// future fixture expansion without a `import` lint warning.
export type { MediaListEnvelope }