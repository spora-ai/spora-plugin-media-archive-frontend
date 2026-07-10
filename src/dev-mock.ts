/**
 * Dev-only mock API + fixture data used by `src/dev-main.ts` to render
 * the UI without a backend. Pure data and pure functions live here so
 * they're unit-testable; the side-effecting Vue bootstrap stays in
 * `dev-main.ts`.
 *
 * The mock honors the same query params the PHP controller supports
 * (`type`, `plugin`, `search`, `page`, `per_page`) so the filter UI
 * is exercisable end-to-end without a database. For real DB-backed
 * testing, run the host SPA + this plugin's dev server + PHP together
 * (see `spora-frontend/vite.config.ts → SPORA_PLUGIN_DEV_PORTS`).
 */
import type { MediaAsset } from './types'
import type { PluginHostContext } from './shims'

export const FIXTURE: MediaAsset[] = [
    {
        id: 'demo-1',
        media_type: 'image',
        mime_type: 'image/png',
        byte_size: 12345,
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
        byte_size: 56789,
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
        created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
        id: 'demo-3',
        media_type: 'image',
        mime_type: 'image/jpeg',
        byte_size: 234567,
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
        created_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
        id: 'demo-4',
        media_type: 'video',
        mime_type: 'video/mp4',
        byte_size: 4567890,
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
        created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
        id: 'demo-5',
        media_type: 'document',
        mime_type: 'application/pdf',
        byte_size: 89012,
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
        created_at: new Date(Date.now() - 172800000).toISOString(),
    },
]

export interface ListQuery {
    type: string
    plugin: string
    search: string
    page: number
    perPage: number
}

export function parseListQuery(path: string): ListQuery {
    const queryString = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
    const params = new URLSearchParams(queryString)
    const pageRaw = params.get('page')
    const perPageRaw = params.get('per_page')
    return {
        type: params.get('type') ?? '',
        plugin: params.get('plugin') ?? '',
        search: (params.get('search') ?? '').trim().toLowerCase(),
        page: pageRaw === null ? 1 : Math.max(1, Number(pageRaw) || 1),
        perPage: perPageRaw === null ? 24 : Math.max(1, Number(perPageRaw) || 1),
    }
}

export function filterFixture(query: ListQuery, source: MediaAsset[] = FIXTURE): MediaAsset[] {
    return source.filter((asset) => {
        if (query.type && asset.media_type !== query.type) return false
        if (query.plugin && asset.plugin_slug !== query.plugin) return false
        if (query.search) {
            const haystack = (asset.prompt ?? '').toLowerCase()
            if (!haystack.includes(query.search)) return false
        }
        return true
    })
}

export function paginate<T>(items: T[], page: number, perPage: number): T[] {
    const start = (page - 1) * perPage
    return items.slice(start, start + perPage)
}

export function createMockApi(): PluginHostContext['api'] {
    return {
        async get<T>(path: string): Promise<T> {
            if (path.startsWith('/media/') && path !== '/media') {
                const id = path.slice('/media/'.length).split('?')[0]
                const found = FIXTURE.find((m) => m.id === id)
                if (!found) throw new Error(`Not found: ${id}`)
                return found as unknown as T
            }
            if (path.startsWith('/media')) {
                const query = parseListQuery(path)
                const filtered = filterFixture(query)
                const page = paginate(filtered, query.page, query.perPage)
                const lastPage = Math.max(1, Math.ceil(filtered.length / query.perPage))
                // The host's API client unwraps `body.data` before handing
                // the value to the caller (see
                // `spora-frontend/src/api/client.ts → request<T>()`), so this
                // mock returns the inner shape directly — matching what
                // `api.get<T>()` will hand to the plugin when mounted under
                // the host. Mirrors the unwrapped wire shape — see types.ts.
                return {
                    assets: page,
                    page: query.page,
                    perPage: query.perPage,
                    total: filtered.length,
                    lastPage: lastPage,
                } as unknown as T
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
}
