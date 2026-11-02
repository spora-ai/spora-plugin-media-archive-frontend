/**
 * Dev-only mock API + fixture data used by `src/dev-main.ts` to render
 * the UI without a backend. Pure data and pure functions live here so
 * they're unit-testable; the side-effecting Vue bootstrap stays in
 * `dev-main.ts`.
 *
 * The mock honors the same query params the PHP controller supports
 * (`type`, `plugin_slug`, `q`, `scope`, `page`, `per_page`) so the filter
 * UI is exercisable end-to-end without a database. For real DB-backed
 * testing, run the host SPA + this plugin's dev server + PHP together
 * (see `spora-frontend/vite.config.ts → SPORA_PLUGIN_DEV_PORTS`).
 */
import type { MediaAsset, MediaFolder, MediaPrincipal } from './types'
import type { PluginHostContext } from './shims'

interface MockAsset extends MediaAsset {
    user_id: number
}

// The demo PDF's `md` body, on a `data:` URL because the mock API serves no bytes.
const DEMO_MARKDOWN = [
    '# Quarterly Earnings Summary',
    '',
    'Revenue grew **12%** year-over-year to $1.4B.',
    '',
    '## Segment breakdown',
    '',
    '- Cloud: +18%',
    '- Hardware: -3%',
    '- Services: +9%',
    '',
    'See the appendix for the full P&L.',
].join('\n')

export const FIXTURE: MockAsset[] = [
    {
        id: 'demo-1',
        user_id: 42,
        // The principal the asset is filed under: a folder write is
        // scoped by it, so the detail page's picker needs it.
        principal_id: 1,
        media_type: 'image',
        mime_type: 'image/png',
        byte_size: 12345,
        width: 1024,
        height: 1024,
        duration_seconds: null,
        prompt: 'A serene alpine lake at golden hour',
        filename: null,
        tags: null,
        asset_url: 'https://placehold.co/600x400/png',
        source_url: 'https://example.com/cdn/foo.png',
        storage_mode: 'external',
        plugin_slug: 'minimax',
        tool_name: 'image',
        agent_id: 'a1',
        task_id: 't1',
        tool_call_id: 'tc1',
        created_at: new Date().toISOString(),
        folder_id: 'folder-corporate',
        kind: 'example',
        derivatives: [],
    },
    {
        id: 'demo-2',
        user_id: 42,
        principal_id: 1,
        media_type: 'audio',
        mime_type: 'audio/mpeg',
        byte_size: 56789,
        width: null,
        height: null,
        duration_seconds: 12.5,
        prompt: 'Welcome to the daily briefing',
        filename: null,
        tags: null,
        asset_url: 'https://placehold.co/600x400/mp3',
        source_url: null,
        storage_mode: 'local',
        plugin_slug: 'minimax',
        tool_name: 'speech',
        agent_id: 'a1',
        task_id: 't2',
        tool_call_id: 'tc2',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        derivatives: [],
    },
    {
        id: 'demo-3',
        user_id: 99,
        principal_id: 1,
        media_type: 'image',
        mime_type: 'image/jpeg',
        byte_size: 234567,
        width: 1920,
        height: 1080,
        duration_seconds: null,
        prompt: 'A product photo on a marble counter',
        filename: null,
        tags: null,
        asset_url: 'https://placehold.co/600x400/jpeg',
        source_url: null,
        storage_mode: 'external',
        plugin_slug: 'minimax',
        tool_name: 'image',
        agent_id: 'a2',
        task_id: 't3',
        tool_call_id: 'tc3',
        created_at: new Date(Date.now() - 7200000).toISOString(),
        derivatives: [],
    },
    {
        id: 'demo-4',
        user_id: 99,
        principal_id: 1,
        media_type: 'video',
        mime_type: 'video/mp4',
        byte_size: 4567890,
        width: 1920,
        height: 1080,
        duration_seconds: 45.2,
        prompt: 'A drone shot of a coastal city at dusk',
        filename: null,
        tags: null,
        asset_url: 'https://placehold.co/600x400/mp4',
        source_url: null,
        storage_mode: 'external',
        plugin_slug: 'minimax',
        tool_name: 'video',
        agent_id: 'a2',
        task_id: 't4',
        tool_call_id: 'tc4',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        derivatives: [],
    },
    {
        id: 'demo-5',
        user_id: 42,
        principal_id: 1,
        media_type: 'document',
        mime_type: 'application/pdf',
        byte_size: 89012,
        width: null,
        height: null,
        duration_seconds: null,
        prompt: 'Quarterly earnings summary',
        filename: null,
        tags: null,
        asset_url: 'https://placehold.co/600x400/pdf',
        source_url: null,
        storage_mode: 'local',
        plugin_slug: 'tavily',
        tool_name: 'research',
        agent_id: 'a3',
        task_id: 't5',
        tool_call_id: 'tc5',
        created_at: new Date(Date.now() - 172800000).toISOString(),
        folder_id: 'folder-templates',
        kind: 'template',
        derivatives: [
            {
                format: 'md',
                label: 'Markdown',
                media_id: 'demo-5-md',
                asset_url: `data:text/markdown;charset=utf-8,${encodeURIComponent(DEMO_MARKDOWN)}`,
                mime_type: 'text/markdown',
                producer_plugin: 'spora-core',
                producer_operation: 'pdf_to_markdown',
                created_at: new Date(Date.now() - 172700000).toISOString(),
            },
        ],
    },
]

export const CURRENT_USER_ID = 42

/**
 * The folders of the mock principal.
 *
 * The panel asks per principal (`/media/folders?principal_id=…`), and
 * the tree is rebuilt from `parent_id` — so the fixture carries both.
 */
export const FOLDER_FIXTURE: MediaFolder[] = [
    { id: 'folder-corporate', name: 'Corporate', path: '/Corporate', parent_id: null, asset_count: 2 },
    { id: 'folder-templates', name: 'Templates', path: '/Corporate/Templates', parent_id: 'folder-corporate', asset_count: 1 },
]

/**
 * The folders of the mock group principal.
 *
 * A folder belongs to a principal, so the sandbox carries a second
 * principal with folders of its own: the rail groups the tree by
 * principal in the "all principals" scope, and a single principal
 * cannot show that.
 */
export const GROUP_FOLDER_FIXTURE: MediaFolder[] = [
    { id: 'folder-shared', name: 'Shared Assets', path: '/Shared Assets', parent_id: null, asset_count: 3 },
    { id: 'folder-photos', name: 'Photos', path: '/Shared Assets/Photos', parent_id: 'folder-shared', asset_count: 2 },
]

/**
 * The principal the sandbox acts as.
 *
 * The panel asks `/principals/me` before it asks for the folders, and
 * the folder tree follows the scope — so the sandbox needs a principal
 * for the tree to render at all.
 */
export const PRINCIPAL_FIXTURE: MediaPrincipal = {
    id: 1,
    type: 'user',
    user_id: CURRENT_USER_ID,
    group_id: null,
}

/**
 * A group principal the caller also belongs to, so the sandbox can show
 * the tree grouped by owner.
 */
export const GROUP_PRINCIPAL_FIXTURE: MediaPrincipal = {
    id: 2,
    type: 'group',
    user_id: null,
    group_id: 7,
}

export type Scope = 'all' | 'mine'

export interface ListQuery {
    type: string
    plugin: string
    search: string
    folderId: string
    kind: string
    scope: Scope
    page: number
    perPage: number
}

export function parseListQuery(path: string): ListQuery {
    const queryString = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
    const params = new URLSearchParams(queryString)
    const pageRaw = params.get('page')
    const perPageRaw = params.get('per_page')
    const scopeRaw = params.get('scope')
    const scope: Scope = scopeRaw === 'mine' ? 'mine' : 'all'
    return {
        type: params.get('type') ?? '',
        // The canonical spellings core reads; the panel sends these.
        plugin: params.get('plugin_slug') ?? '',
        search: (params.get('q') ?? '').trim().toLowerCase(),
        folderId: params.get('folder_id') ?? '',
        kind: params.get('kind') ?? '',
        scope,
        page: pageRaw === null ? 1 : Math.max(1, Number(pageRaw) || 1),
        perPage: perPageRaw === null ? 24 : Math.max(1, Number(perPageRaw) || 1),
    }
}

export function filterFixture(query: ListQuery, source: MediaAsset[] = FIXTURE as MediaAsset[], currentUserId: number = CURRENT_USER_ID): MediaAsset[] {
    return source.filter((asset) => {
        if (query.scope === 'mine') {
            const ownerId = (asset as MediaAsset & { user_id?: number | null }).user_id
            if (ownerId !== currentUserId) return false
        }
        if (query.type && asset.media_type !== query.type) return false
        if (query.plugin && asset.plugin_slug !== query.plugin) return false
        if (query.folderId && asset.folder_id !== query.folderId) return false
        if (query.kind && (asset.kind ?? 'asset') !== query.kind) return false
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
    // The sandbox is stateful: a folder the operator creates joins the
    // principal it belongs to, so the rail shows it.
    const folders: Record<number, MediaFolder[]> = {
        [PRINCIPAL_FIXTURE.id]: [...FOLDER_FIXTURE],
        [GROUP_PRINCIPAL_FIXTURE.id]: [...GROUP_FOLDER_FIXTURE],
    }
    // A mutable copy of the fixture, so an asset the operator files into
    // a folder stays there.
    const assets: MediaAsset[] = FIXTURE.map((asset) => ({ ...asset }))

    return {
        async get<T>(path: string): Promise<T> {
            if (path === '/principals/me') {
                return { principals: [PRINCIPAL_FIXTURE, GROUP_PRINCIPAL_FIXTURE] } as unknown as T
            }
            if (path === '/groups') {
                // The friendly name of the group the sandbox acts as. The
                // panel keys it by the group's *principal* id, and falls
                // back to `Group #N` without it.
                return {
                    groups: [{
                        id: GROUP_PRINCIPAL_FIXTURE.group_id ?? 0,
                        name: 'Marketing Team',
                        principal_id: GROUP_PRINCIPAL_FIXTURE.id,
                    }],
                } as unknown as T
            }
            if (path.startsWith('/media/folders')) {
                const principalId = Number(/principal_id=(\d+)/.exec(path)?.[1])
                return { folders: folders[principalId] ?? [] } as unknown as T
            }
            if (path.startsWith('/media/') && path !== '/media') {
                const id = path.slice('/media/'.length).split('?')[0]
                const found = assets.find((m) => m.id === id)
                if (!found) throw new Error(`Not found: ${id}`)
                return found as unknown as T
            }
            if (path.startsWith('/media')) {
                const query = parseListQuery(path)
                const filtered = filterFixture(query, assets)
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
        post<T>(path: string, body: unknown): Promise<T> {
            if (path === '/media/folders') {
                const payload = body as { name: string; parent_id: string | null; principal_id: number }
                const list = folders[payload.principal_id] ?? []
                const parent = payload.parent_id === null
                    ? null
                    : list.find((folder) => folder.id === payload.parent_id)
                if (payload.parent_id !== null && parent === undefined) {
                    // The server's rule: a parent of another principal is a
                    // 404, not a 403.
                    return Promise.reject(Object.assign(new Error('Media folder not found.'), { status: 404 }))
                }
                const path_ = `${parent?.path ?? ''}/${payload.name}`
                if (list.some((folder) => folder.path === path_ && folder.parent_id === payload.parent_id)) {
                    return Promise.reject(Object.assign(new Error('A folder with that name already exists here.'), {
                        code: 'NOT_UNIQUE',
                    }))
                }
                const folder: MediaFolder = {
                    id: `folder-new-${Date.now()}`,
                    name: payload.name,
                    path: path_,
                    parent_id: payload.parent_id,
                    asset_count: 0,
                }
                folders[payload.principal_id] = [...list, folder]
                return Promise.resolve(folder as unknown as T)
            }
            return Promise.reject(new Error('POST not supported in mock'))
        },
        postForm: async (_path: string, _body: FormData) => {
            throw new Error('POST FormData not supported in mock')
        },
        patch: async <T>(path: string, body: unknown): Promise<T> => {
            const id = path.slice('/media/'.length).split('?')[0]
            const found = assets.find((asset) => asset.id === id)
            if (!found) throw new Error(`Not found: ${id}`)
            const payload = body as { folder_id?: string | null; kind?: string }
            if (payload.folder_id !== undefined) {
                if (payload.folder_id !== null) {
                    // The server scopes a folder write by the asset's
                    // principal and refuses a folder of another one.
                    const owned = folders[found.principal_id ?? 0] ?? []
                    if (!owned.some((folder) => folder.id === payload.folder_id)) {
                        throw Object.assign(new Error('Media folder not found.'), {
                            code: 'UNKNOWN_FOLDER',
                        })
                    }
                }
                found.folder_id = payload.folder_id
            }
            if (payload.kind !== undefined) {
                found.kind = payload.kind as MediaAsset['kind']
            }
            return found as unknown as T
        },
        delete: async () => {
            throw new Error('DELETE not supported in mock')
        },
    }
}
