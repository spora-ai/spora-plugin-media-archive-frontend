/**
 * Dev-only entry. Boots the same component tree as the production bundle
 * but renders it into `#app` instead of the host's plugin slot, with a
 * mock host context that lets the UI load data without a backend.
 *
 * The mock API mirrors the real `/api/v1/media` envelope shape so the
 * components behave identically in dev and prod — only the data source
 * differs. The mock honors the same query params the PHP controller
 * supports (`type`, `plugin`, `search`, `page`, `per_page`) so the
 * filter UI can be exercised end-to-end without a database.
 *
 * For end-to-end testing against a real backend, use the host dev flow:
 *   1. PHP at :8080 (`composer dev` in spora-local)
 *   2. Plugin dev at :5174 (`npm run dev` here)
 *   3. Host SPA at :5173 (`npm run dev` in spora-frontend)
 * The host's `vite.config.ts → server.proxy` then forwards
 * `/api` to PHP and `/plugins/media-archive/*` to this dev server.
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
    {
        id: 'demo-3',
        media_type: 'image',
        mime_type: 'image/jpeg',
        byte_size: 234_567,
        width: 1920,
        height: 1080,
        duration_seconds: null,
        prompt: 'A product photo on a marble counter',
        asset_url: 'https://placehold.co/600x400/jpeg',
        source_url: null,
        storage_mode: 'external',
        plugin_slug: 'minimax',
        tool_name: 'image',
        agent_id: 'a2',
        task_id: 't3',
        tool_call_id: 'tc3',
        created_at: new Date(Date.now() - 7_200_000).toISOString(),
    },
    {
        id: 'demo-4',
        media_type: 'video',
        mime_type: 'video/mp4',
        byte_size: 4_567_890,
        width: 1920,
        height: 1080,
        duration_seconds: 45.2,
        prompt: 'A drone shot of a coastal city at dusk',
        asset_url: 'https://placehold.co/600x400/mp4',
        source_url: null,
        storage_mode: 'external',
        plugin_slug: 'minimax',
        tool_name: 'video',
        agent_id: 'a2',
        task_id: 't4',
        tool_call_id: 'tc4',
        created_at: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
        id: 'demo-5',
        media_type: 'document',
        mime_type: 'application/pdf',
        byte_size: 89_012,
        width: null,
        height: null,
        duration_seconds: null,
        prompt: 'Quarterly earnings summary',
        asset_url: 'https://placehold.co/600x400/pdf',
        source_url: null,
        storage_mode: 'local',
        plugin_slug: 'tavily',
        tool_name: 'research',
        agent_id: 'a3',
        task_id: 't5',
        tool_call_id: 'tc5',
        created_at: new Date(Date.now() - 172_800_000).toISOString(),
    },
]

interface ListQuery {
    type: string
    plugin: string
    search: string
    page: number
    perPage: number
}

function parseListQuery(path: string): ListQuery {
    const queryString = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
    const params = new URLSearchParams(queryString)
    return {
        type: params.get('type') ?? '',
        plugin: params.get('plugin') ?? '',
        search: (params.get('search') ?? '').trim().toLowerCase(),
        page: Math.max(1, Number(params.get('page') ?? '1') || 1),
        perPage: Math.max(1, Number(params.get('per_page') ?? '24') || 24),
    }
}

function filterFixture(query: ListQuery): MediaAsset[] {
    return FIXTURE.filter((asset) => {
        if (query.type && asset.media_type !== query.type) return false
        if (query.plugin && asset.plugin_slug !== query.plugin) return false
        if (query.search) {
            const haystack = (asset.prompt ?? '').toLowerCase()
            if (!haystack.includes(query.search)) return false
        }
        return true
    })
}

// Tell the developer they're in sandbox mode so they don't waste time
// wondering why their real backend isn't responding. One line, no spammy
// stack traces — this is intentional dev affordance, not production noise.
console.info('[spora/media-archive] dev sandbox — using in-memory fixtures (no backend)')

const mockApi: PluginHostContext['api'] = {
    async get<T>(path: string): Promise<{ data: T }> {
        if (path.startsWith('/media/') && path !== '/media') {
            const id = path.slice('/media/'.length).split('?')[0]
            const found = FIXTURE.find((m) => m.id === id)
            if (!found) throw new Error(`Not found: ${id}`)
            return { data: { data: found } as T }
        }
        if (path.startsWith('/media')) {
            const query = parseListQuery(path)
            const filtered = filterFixture(query)
            const start = (query.page - 1) * query.perPage
            const page = filtered.slice(start, start + query.perPage)
            const lastPage = Math.max(1, Math.ceil(filtered.length / query.perPage))
            return {
                data: {
                    data: page,
                    meta: {
                        current_page: query.page,
                        per_page: query.perPage,
                        total: filtered.length,
                        last_page: lastPage,
                    },
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