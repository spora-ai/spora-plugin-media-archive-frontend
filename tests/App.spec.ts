import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import App from '../src/App.vue'
import type {
    MediaAsset,
    MediaFolder,
    MediaGroup,
    MediaListResponse,
    MediaPrincipal,
} from '../src/types'
import type { PluginHostContext } from '../src/shims'
import { __resetShowTemporaryToggleForTesting } from '../src/composables/useShowTemporaryToggle'

type GetFn = <T = unknown>(path: string) => Promise<T>
type MockedApi = {
    get: GetFn | ReturnType<typeof vi.fn>
    post: ReturnType<typeof vi.fn>
    postForm: ReturnType<typeof vi.fn>
    patch: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
}

const sample: MediaAsset = {
    id: 'test-1',
    media_type: 'image',
    mime_type: 'image/png',
    byte_size: 4096,
    width: 64,
    height: 64,
    duration_seconds: null,
    prompt: 'a tiny pixel',
    filename: null,
    tags: null,
    asset_url: 'data:image/png;base64,AAAA',
    source_url: null,
    storage_mode: 'data_url',
    plugin_slug: 'minimax',
    tool_name: 'image',
    agent_id: null,
    task_id: null,
    tool_call_id: null,
    created_at: new Date().toISOString(),
    derivatives: [],
}

const emptyList: MediaListResponse = {
    assets: [],
    page: 1,
    perPage: 24,
    total: 0,
    lastPage: 1,
}

/**
 * Default principals + groups fixtures the App.vue's bootstrapScope()
 * call resolves with. The plugin reads `id` and `type` off a principal
 * and `principal_id` + `name` off a group; the rest is here to mirror
 * the wire shape from `GET /principals/me` and `GET /groups` so a
 * future consumer that grows the panel doesn't have to rewire every
 * test.
 */
const defaultPrincipals: MediaPrincipal[] = [
    { id: 101, type: 'user', user_id: 1, group_id: null },
    { id: 202, type: 'group', user_id: null, group_id: 10 },
]
const defaultGroups: MediaGroup[] = [
    { id: 10, name: 'Marketing Team', principal_id: 202 },
]

/**
 * The folders of each visible principal.
 *
 * The panel asks per principal (`/media/folders?principal_id=…`), and
 * the server answers with that principal's folders only — so the
 * fixture is keyed the same way.
 */
const defaultFolders: Record<number, MediaFolder[]> = {
    101: [
        { id: 'folder-1', name: 'Corporate', path: '/Corporate', parent_id: null, asset_count: 2 },
        { id: 'folder-2', name: '2026', path: '/Corporate/2026', parent_id: 'folder-1', asset_count: 1 },
    ],
    202: [
        { id: 'folder-3', name: 'Brand', path: '/Brand', parent_id: null, asset_count: 4 },
    ],
}

/**
 * Build a stub `hostContext` with the `get` mock and the
 * `/principals/me` + `/groups` defaults stubbed in. The defaults
 * mirror what the host returns for an authenticated user with one
 * group; individual tests can override the `mediaHandlers` map to
 * stub a different shape (empty principals, multi-group, etc.).
 */
function buildContext(
    get: ReturnType<typeof vi.fn>,
    route?: { path: string },
    mediaHandlers?: {
        principals?: MediaPrincipal[]
        groups?: MediaGroup[]
        folders?: Record<number, MediaFolder[]>
        /**
         * Make the folders endpoint answer with this status. A 404 is
         * what a core predating the folders release answers with.
         */
        foldersStatus?: number
    },
): PluginHostContext {
    const principals = mediaHandlers?.principals ?? defaultPrincipals
    const groups = mediaHandlers?.groups ?? defaultGroups
    const folders = mediaHandlers?.folders ?? defaultFolders
    // Wrap the mock so the bootstrap calls resolve to the provided
    // fixtures BEFORE falling through to the user's per-call
    // expectations. The wrapper is transparent to anything that
    // doesn't match a known endpoint.
    const wrappedGet = vi.fn((path: string) => {
        if (path === '/principals/me') {
            return Promise.resolve({ principals })
        }
        if (path === '/groups') {
            return Promise.resolve({ groups })
        }
        // The folders are principal-scoped, so the path carries the
        // principal as a query parameter.
        if (path.startsWith('/media/folders')) {
            if (mediaHandlers?.foldersStatus !== undefined) {
                // The host's client throws an ApiError carrying the
                // status; the panel reads it by shape.
                return Promise.reject(
                    Object.assign(new Error(`HTTP ${mediaHandlers.foldersStatus}`), {
                        status: mediaHandlers.foldersStatus,
                    }),
                )
            }
            const principalId = Number(/principal_id=(\d+)/.exec(path)?.[1])
            return Promise.resolve({ folders: folders[principalId] ?? [] })
        }
        // `get` is a `Mock<...>` (callable-or-constructable union);
        // cast to the callable signature so the inner `vi.fn()` body
        // satisfies vue-tsc.
        return (get as unknown as (path: string) => Promise<unknown>)(path)
    })
    const api: MockedApi = {
        get: wrappedGet,
        post: vi.fn(),
        postForm: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    }
    // The plugin reads `hostContext.router.currentRoute.value.path` (a
    // `shallowRef`). Stub it with a plain `ref` whose value can be
    // reassigned in tests to simulate host navigation.
    const initialPath = (route ?? { path: '/apps/media-archive' }).path
    const currentRoute = ref({ path: initialPath })
    const afterEachCbs: Array<(to: { path: string }) => void> = []
    const router = {
        // `select()` and `goBack()` call `router.push(to)`. Mirror
        // Vue Router's behavior: update `currentRoute.value` and
        // fire any `afterEach` hooks.
        push: (to: string) => {
            const path = typeof to === 'string' ? to : (to as { path: string }).path
            currentRoute.value = { path }
            for (const cb of afterEachCbs) cb({ path })
            return Promise.resolve()
        },
        currentRoute,
        afterEach: (cb: (to: { path: string }) => void) => {
            afterEachCbs.push(cb)
            return () => {
                const i = afterEachCbs.indexOf(cb)
                if (i >= 0) afterEachCbs.splice(i, 1)
            }
        },
    }
    return {
        // The shim expects a typed callable. Cast through `unknown` to keep
        // the test ergonomics (no need to re-declare the generic at every
        // call site) while satisfying vue-tsc's stricter overload check.
        api: api as unknown as PluginHostContext['api'],
        pinia: null,
        locale: 'en',
        theme: 'light',
        route: { path: initialPath, params: {}, query: {} } as unknown as PluginHostContext['route'],
        router: router as unknown as PluginHostContext['router'],
    }
}

/**
 * The scope dropdown of the folder rail.
 *
 * The toolbar carries a compact copy of the same control for the narrow
 * screen, so the rail's is picked explicitly — otherwise the first
 * match in the document could be either of the two.
 */
function railScopeToggle(wrapper: VueWrapper) {
    return wrapper.find('[data-testid="media-folder-rail"] [data-testid="media-scope-toggle"]')
}

/**
 * Pick a principal in the rail's scope dropdown.
 *
 * Picking a row does not close the menu — the parent owns the selection
 * and re-renders — so the menu is only opened when it is closed.
 */
async function pickScope(wrapper: VueWrapper, principalId: number | null): Promise<void> {
    if (!wrapper.find('[data-testid="media-folder-rail"] [data-testid="media-scope-menu"]').exists()) {
        await railScopeToggle(wrapper).trigger('click')
    }
    const option = principalId === null ? 'all' : String(principalId)
    await wrapper.find(`[data-testid="media-scope-option-${option}"]`).trigger('click')
}

/**
 * Pick a file type in the toolbar's type dropdown.
 */
async function pickType(wrapper: VueWrapper, type: string): Promise<void> {
    if (!wrapper.find('[data-testid="media-type-select-menu"]').exists()) {
        await wrapper.find('[data-testid="media-type-select-toggle"]').trigger('click')
    }
    await wrapper.find(`[data-testid="media-type-select-option-${type}"]`).trigger('click')
}

/**
 * Pick a mark in the toolbar's kind dropdown.
 */
async function pickKind(wrapper: VueWrapper, kind: string): Promise<void> {
    if (!wrapper.find('[data-testid="media-kind-select-menu"]').exists()) {
        await wrapper.find('[data-testid="media-kind-select-toggle"]').trigger('click')
    }
    await wrapper.find(`[data-testid="media-kind-select-option-${kind}"]`).trigger('click')
}

describe('App.vue', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        // Reset the temporary-files toggle so its persisted state
        // doesn't leak between tests (one test flips it on, the next
        // asserts the default off — without this the singleton keeps
        // the flipped value).
        __resetShowTemporaryToggleForTesting()
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        __resetShowTemporaryToggleForTesting()
    })

    it('renders the heading and total count after loading', async () => {
        const list: MediaListResponse = {
            assets: [sample, { ...sample, id: 'test-2' }],
            page: 1,
            perPage: 24,
            total: 2,
            lastPage: 1,
        }
        const get = vi.fn().mockResolvedValueOnce(list)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('#spora-plugin-media-archive').exists()).toBe(true)
        expect(wrapper.text()).toContain('Media Archive')
        expect(wrapper.text()).toContain('2 assets')
        expect(get).toHaveBeenCalledTimes(1)
        expect(get.mock.calls[0]?.[0]).toContain('/media?')
    })

    it('renders "1 asset" (singular) when total is 1', async () => {
        const get = vi.fn().mockResolvedValueOnce({
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 1,
            lastPage: 1,
        })
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.text()).toContain('1 asset')
        expect(wrapper.text()).not.toContain('1 assets')
    })

    it('renders "10 assets" (plural) when total is 10', async () => {
        const get = vi.fn().mockResolvedValueOnce({
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 10,
            lastPage: 1,
        })
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.text()).toContain('10 assets')
    })

    it('lists the visible principals in the scope dropdown', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        // Default fixtures: My Media (user principal 101), Group A
        // (group principal 202 = "Marketing Team"), plus the ALL row.
        await railScopeToggle(wrapper).trigger('click')
        expect(wrapper.find('[data-testid="media-scope-option-all"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-option-101"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-option-202"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-option-202"]').text()).toContain('Marketing Team')
    })

    it('labels the user-principal "My Media", never as "Group #N"', async () => {
        // Regression for the bug where the user-principal was rendered
        // with the `Group #${id}` fallback label because the frontend
        // lost the `type` discriminator before the scope select could
        // read it. The dashboard's own `My Agents` chip never had this
        // bug — we should match its visual contract.
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await railScopeToggle(wrapper).trigger('click')
        // The user-principal row is data-testid="media-scope-option-101"
        // but its label must say "My Media" regardless of the id number.
        expect(wrapper.find('[data-testid="media-scope-option-101"]').text()).toContain('My Media')
        expect(wrapper.find('[data-testid="media-scope-option-101"]').text()).not.toContain('Group #101')
        // The group-principal falls back to `Group #202` because no
        // /groups entry keyed principal_id=202 was provided.
        const helper2 = buildContext(vi.fn().mockResolvedValue(emptyList), undefined, { groups: [] })
        const wrapper2 = mount(App, { props: { hostContext: helper2 } })
        await flushPromises()
        await flushPromises()
        await railScopeToggle(wrapper2).trigger('click')
        expect(wrapper2.find('[data-testid="media-scope-option-202"]').text()).toContain('Group #202')
    })

    it('lists no principal when the user has no visible principals', async () => {
        // A brand-new user with no groups: the scope dropdown has
        // nothing to pick. The grid still works (the API falls back to
        // the legacy ownership union).
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get, undefined, { principals: [], groups: [] })
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await railScopeToggle(wrapper).trigger('click')
        expect(wrapper.find('[data-testid="media-scope-option-all"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-option-101"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-scope-option-202"]').exists()).toBe(false)
    })

    it('sends every visible principal_id when scope is ALL (default)', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        // Default principals fixture: user 101 + group 202 → two
        // `principal_id[]=` keys (URL-encoded as `%5B%5D` by
        // URLSearchParams). ALL = the empty selection means "every
        // visible principal", so both should be in the URL.
        // The `[]` array suffix is required: PHP's `parse_str()`
        // collapses repeated scalar keys to the LAST value, which
        // would silently drop the user-principal id and surface only
        // the last group's media.
        const url = get.mock.calls.find((c) => c[0]?.startsWith('/media'))?.[0] ?? ''
        expect(url).toContain('principal_id%5B%5D=101')
        expect(url).toContain('principal_id%5B%5D=202')
    })

    it('sends a single principal_id when a principal is picked', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await pickScope(wrapper, 202)
        await flushPromises()
        await flushPromises()
        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).toContain('principal_id%5B%5D=202')
        // The user-principal must NOT be sent alongside the picked group
        // — picking a specific group means "only this group", and the
        // server's `includeUploads` branch would otherwise leak the
        // user's own uploads into the per-group view.
        expect(last).not.toContain('principal_id%5B%5D=101')
    })

    it('sends every visible principal_id again when ALL is picked', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await pickScope(wrapper, 202)
        await flushPromises()
        await pickScope(wrapper, null)
        await flushPromises()
        await flushPromises()
        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).toContain('principal_id%5B%5D=101')
        expect(last).toContain('principal_id%5B%5D=202')
    })

    it('drops stale responses when filters change faster than the network', async () => {
        // Use real timers for this test so we can resolve promises in
        // deterministic order without depending on fake-timer flush semantics.
        vi.useRealTimers()
        const captured: { resolve: ((v: MediaListResponse) => void) | null } = { resolve: null }
        const slowPromise = new Promise<MediaListResponse>((resolve) => {
            captured.resolve = resolve
        })
        const fastResult: MediaListResponse = { assets: [], page: 1, perPage: 24, total: 0, lastPage: 1 }
        const slowResult: MediaListResponse = { assets: [sample], page: 1, perPage: 24, total: 1, lastPage: 1 }
        const get = vi.fn()
            .mockReturnValueOnce(slowPromise)
            .mockResolvedValueOnce(fastResult)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        // Allow the initial (slow) call to settle as pending.
        await flushPromises()
        // Trigger a filter change — this should swap to the fast call.
        await pickType(wrapper, 'image')
        await flushPromises()
        await flushPromises()
        // Now resolve the stale (initial) request — its handler must bail
        // out because the requestId has advanced.
        captured.resolve?.(slowResult)
        await flushPromises()
        // The grid must reflect the second (fast) response, not the slow one.
        const heading = wrapper.find('header p').text()
        expect(heading).toContain('0 assets')
    })

    it('surfaces the error when /media fails', async () => {
        const get = vi.fn().mockRejectedValueOnce(new Error('Boom'))
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.text()).toContain('Failed to load media')
        expect(wrapper.text()).toContain('Boom')
    })

    it('shows a loading indicator while the request is pending', async () => {
        let resolveFn: ((value: MediaListResponse) => void) | null = null
        const get = vi.fn().mockReturnValueOnce(
            new Promise<MediaListResponse>((resolve) => {
                resolveFn = resolve
            }),
        )
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        expect(wrapper.text()).toContain('Loading media')
        // `resolveFn` is captured inside the Promise executor; the strict
        // optional-chain types don't see it as a function here. Cast through
        // `unknown` to invoke the resolved reference safely.
        ;(resolveFn as unknown as ((v: MediaListResponse) => void) | null)?.(emptyList)
        await flushPromises()
        await flushPromises()
    })

    it('passes the active filter to the API when the user changes type', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(1)
        await pickType(wrapper, 'image')
        await flushPromises()
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(2)
        expect(get.mock.calls[1]?.[0]).toContain('type=image')
        expect(get.mock.calls[1]?.[0]).toContain('page=1')
    })

    it('passes the search term to the API as the user types', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await wrapper.find('[data-testid="media-search"]').setValue('alpine')
        await flushPromises()
        await flushPromises()
        expect(get.mock.calls.at(-1)?.[0]).toContain('q=alpine')
    })

    it('navigates to the detail page when a card is selected (route push)', async () => {
        const get = vi.fn().mockResolvedValue({
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 1,
            lastPage: 1,
        })
        const ctx = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: ctx } })
        await flushPromises()
        await flushPromises()
        await wrapper.find(`[data-testid="media-card-${sample.id}"]`).trigger('click')
        await flushPromises()
        expect(ctx.router!.currentRoute.value.path).toBe(`/apps/media-archive/asset/${sample.id}`)
    })

    it('renders the detail page when the host route is /asset/:id', async () => {
        const detailGet = vi.fn().mockResolvedValue(sample)
        const ctx = buildContext(detailGet)
        ctx.router!.push(`/apps/media-archive/asset/${sample.id}`)
        await flushPromises()
        const wrapper = mount(App, { props: { hostContext: ctx } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('#spora-plugin-media-archive').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-detail-page"]').exists()).toBe(true)
        expect(detailGet).toHaveBeenCalledWith(`/media/${sample.id}`)
    })

    it('removes the asset and decrements total on detail page delete', async () => {
        const second: MediaAsset = { ...sample, id: 'test-2' }
        const get = vi.fn()
            // Initial grid load (the test mounts at /asset/<id> but App.vue
            // still issues the list call before the route watcher kicks
            // in — the mock only matters if the test ever drives a
            // back-navigation before the watcher fires).
            .mockResolvedValueOnce({
                assets: [sample, second],
                page: 1,
                perPage: 24,
                total: 2,
                lastPage: 1,
            })
            // Detail page load for the current asset.
            .mockResolvedValueOnce(sample)
            // Post-delete grid reload: the delete handler pushes back to
            // /apps/media-archive which fires the activeAssetId watcher
            // and reissues /media — without this third return the mock
            // resolves undefined, MediaGrid reads .length on undefined,
            // and the unhandled rejection fails CI even though no
            // assertion fails.
            .mockResolvedValueOnce({
                assets: [second],
                page: 1,
                perPage: 24,
                total: 1,
                lastPage: 1,
            })
        const helper = buildContext(get, { path: `/apps/media-archive/asset/${sample.id}` })
        const wrapper = mount(App, {
            props: { hostContext: helper },

        })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-detail-page"]').exists()).toBe(true)
        const detail = wrapper.findComponent({ name: 'MediaDetailPage' })
        detail.vm.$emit('deleted', sample.id)
        await flushPromises()
        // The URL must bounce back to the grid so the user isn't stuck on
        // a detail page pointing at the now-deleted asset.
        expect(helper.router!.currentRoute.value.path).toBe('/apps/media-archive')
    })

    it('decrements the total as soon as the asset is deleted', async () => {
        // The reload that follows the delete is left pending, so the
        // header shows the count the deletion left behind rather than
        // the one the server sends back.
        const second: MediaAsset = { ...sample, id: 'test-2' }
        const get = vi.fn()
            .mockResolvedValueOnce({
                assets: [sample, second],
                page: 1,
                perPage: 24,
                total: 2,
                lastPage: 1,
            })
            .mockResolvedValueOnce(sample)
            .mockReturnValueOnce(new Promise<MediaListResponse>(() => {}))
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('header p').text()).toContain('2 assets')

        helper.router!.push(`/apps/media-archive/asset/${sample.id}`)
        await flushPromises()
        await flushPromises()
        const detail = wrapper.findComponent({ name: 'MediaDetailPage' })
        detail.vm.$emit('deleted', sample.id)
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('header p').text()).toContain('1 asset')
    })

    it('updates the matching card when the detail page emits updated', async () => {        const get = vi.fn().mockResolvedValueOnce(sample)
        const helper = buildContext(get, { path: `/apps/media-archive/asset/${sample.id}` })
        const wrapper = mount(App, {
            props: { hostContext: helper },

        })
        await flushPromises()
        await flushPromises()
        const detail = wrapper.findComponent({ name: 'MediaDetailPage' })
        const renamed: MediaAsset = { ...sample, filename: 'renamed.png' }
        detail.vm.$emit('updated', renamed)
        await flushPromises()
        expect(detail.props('assetId')).toBe(sample.id)
    })

    it('invalidates pending requests when unmounted before the response arrives', async () => {
        vi.useRealTimers()
        let resolveFn: ((v: MediaListResponse) => void) | null = null
        const get = vi.fn().mockReturnValueOnce(
            new Promise<MediaListResponse>((resolve) => {
                resolveFn = resolve
            }),
        )
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        // Unmount while the initial request is still pending.
        wrapper.unmount()
        // Now resolve the dangling promise — the handler must see the
        // bumped requestId and bail without touching any ref. Reaching
        // this point without an "update on unmounted component" warning
        // is the success criterion.
        ;(resolveFn as unknown as ((v: MediaListResponse) => void) | null)?.({
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 1,
            lastPage: 1,
        })
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(1)
    })

    it('re-renders when the host navigates within the plugin mount', async () => {
        // Regression for the in-app detail URL: clicking a card pushes
        // /apps/media-archive/asset/<id>; the grid must give way to the
        // detail page without a remount.
        const get = vi.fn()
            .mockResolvedValueOnce({ assets: [sample], page: 1, perPage: 24, total: 1, lastPage: 1 })
            .mockResolvedValueOnce(sample)
        const ctx = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: ctx } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-archive-grid-view"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-detail-page"]').exists()).toBe(false)

        ctx.router!.push(`/apps/media-archive/asset/${sample.id}`)
        await flushPromises()

        expect(wrapper.find('[data-testid="media-archive-grid-view"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-detail-page"]').exists()).toBe(true)
    })

    it('renders the Upload button in the toolbar when principals are visible', async () => {
        const get = vi.fn().mockResolvedValueOnce(emptyList)
        const ctx = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: ctx } })
        await flushPromises()
        await flushPromises()
        const button = wrapper.find('[data-testid="media-archive-upload-button"]')
        expect(button.exists()).toBe(true)
        // The button must NOT be disabled because the default fixtures
        // include a user-principal + a group-principal.
        expect(button.attributes('disabled')).toBeUndefined()

        await button.trigger('click')
        await flushPromises()
        // Clicking opens the upload dialog.
        expect(wrapper.find('[data-testid="media-upload-dialog"]').exists()).toBe(true)
    })

    it('disables the Upload button when no principals are visible', async () => {
        const get = vi.fn().mockResolvedValueOnce(emptyList)
        const ctx = buildContext(get, undefined, { principals: [], groups: [] })
        const wrapper = mount(App, { props: { hostContext: ctx } })
        await flushPromises()
        await flushPromises()
        const button = wrapper.find('[data-testid="media-archive-upload-button"]')
        expect(button.exists()).toBe(true)
        // Defence-in-depth: a brand-new user with no visible principals
        // must NOT be able to open the upload surface.
        expect(button.attributes('disabled')).toBeDefined()
    })

    it('renders a Load more button when more pages remain, and hides it on the last page', async () => {
        const page1: MediaListResponse = {
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 48,
            lastPage: 2,
        }
        const page2: MediaListResponse = {
            assets: [{ ...sample, id: 'test-2' }],
            page: 2,
            perPage: 24,
            total: 48,
            lastPage: 2,
        }
        const get = vi.fn()
            .mockResolvedValueOnce(page1)
            .mockResolvedValueOnce(page2)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        expect(wrapper.find('[data-testid="media-load-more-button"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-load-more-meta"]').text()).toContain('Showing 1 of 48')

        await wrapper.find('[data-testid="media-load-more-button"]').trigger('click')
        await flushPromises()
        await flushPromises()

        // Count the cards by their `media-card-<id>` testid; the
        // `media-card-filename` / `media-card-derivative-*` inner
        // elements also match the broader prefix and would inflate
        // the count, so we filter to the asset-id-shaped ones only.
        const cardTestIds = wrapper.findAll('[data-testid^="media-card-"]')
            .map((c) => c.attributes('data-testid') ?? '')
            .filter((id) => /^media-card-[a-z0-9-]+$/.test(id) && id !== 'media-card-filename')
        expect(cardTestIds).toHaveLength(2)
        expect(cardTestIds).toContain('media-card-test-1')
        expect(cardTestIds).toContain('media-card-test-2')
        expect(get.mock.calls.at(-1)?.[0]).toContain('page=2')

        // The button and the meta line under it render together as one
        // `v-if` group.
        expect(wrapper.find('[data-testid="media-load-more-button"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-load-more-meta"]').exists()).toBe(false)
    })

    it('does not render a Load more button when the first page is the last page', async () => {
        const singlePage: MediaListResponse = {
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 1,
            lastPage: 1,
        }
        const get = vi.fn().mockResolvedValueOnce(singlePage)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-load-more-button"]').exists()).toBe(false)
    })

    it('deduplicates rows when a concurrent insert lands the same id on consecutive pages', async () => {
        // Operator just produced a derivative and the LIST endpoint's
        // `lastPage` was computed BEFORE the insert. Page 2's slice
        // overlaps page 1 by one row (the new derivative's parent).
        const shared = { ...sample, id: 'shared-id' }
        const page1: MediaListResponse = {
            assets: [sample, shared],
            page: 1,
            perPage: 24,
            total: 25,
            lastPage: 2,
        }
        const page2: MediaListResponse = {
            assets: [shared, { ...sample, id: 'test-3' }],
            page: 2,
            perPage: 24,
            total: 25,
            lastPage: 2,
        }
        const get = vi.fn()
            .mockResolvedValueOnce(page1)
            .mockResolvedValueOnce(page2)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await wrapper.find('[data-testid="media-load-more-button"]').trigger('click')
        await flushPromises()
        await flushPromises()
        const cardTestIds = wrapper.findAll('[data-testid^="media-card-"]')
            .map((c) => c.attributes('data-testid') ?? '')
            .filter((id) => /^media-card-[a-z0-9-]+$/.test(id) && id !== 'media-card-filename')
        expect(cardTestIds).toHaveLength(3)
        expect(cardTestIds.filter((id) => id === 'media-card-shared-id')).toHaveLength(1)
    })

    it('resets pagination when a filter changes so Load more starts fresh from page 1', async () => {
        const first: MediaListResponse = {
            assets: [sample, { ...sample, id: 'test-2' }],
            page: 1,
            perPage: 24,
            total: 50,
            lastPage: 3,
        }
        const afterFilter: MediaListResponse = {
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 1,
            lastPage: 1,
        }
        const get = vi.fn()
            .mockResolvedValueOnce(first)
            .mockResolvedValueOnce(afterFilter)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-load-more-button"]').exists()).toBe(true)
        await pickType(wrapper, 'image')
        await flushPromises()
        await flushPromises()
        expect(get.mock.calls.at(-1)?.[0]).toContain('page=1')
        expect(wrapper.find('[data-testid="media-load-more-button"]').exists()).toBe(false)
    })

    it('surfaces a failed Load more as an inline error under the button without blanking the grid', async () => {
        // Regression: a transient pagination failure shouldn't hide the
        // rows we already loaded. Append-mode errors live on a separate
        // ref (`appendError`) so the button + meta row can stay
        // mounted and the operator can retry — the grid-level `error`
        // would otherwise blank the entire view.
        const page1: MediaListResponse = {
            assets: [sample, { ...sample, id: 'test-2' }],
            page: 1,
            perPage: 24,
            total: 48,
            lastPage: 2,
        }
        const get = vi.fn()
            .mockResolvedValueOnce(page1)
            .mockRejectedValueOnce(new Error('network down'))
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-load-more-button"]').trigger('click')
        await flushPromises()
        await flushPromises()

        // The already-loaded rows must still be rendered — a failed
        // append must never wipe the grid.
        const cardTestIds = wrapper.findAll('[data-testid^="media-card-"]')
            .map((c) => c.attributes('data-testid') ?? '')
            .filter((id) => /^media-card-[a-z0-9-]+$/.test(id) && id !== 'media-card-filename')
        expect(cardTestIds).toHaveLength(2)

        // The inline error appears under the button via the dedicated
        // testid; the full-grid blocker (which replaces the grid with a
        // destructive banner) is NOT used for append failures.
        const inlineError = wrapper.find('[data-testid="media-load-more-error"]')
        expect(inlineError.exists()).toBe(true)
        expect(inlineError.text()).toContain('Couldn\'t load more')
        expect(inlineError.text()).toContain('network down')
        expect(wrapper.text()).not.toContain('Failed to load media')

        await wrapper.find('[data-testid="media-load-more-button"]').trigger('click')
        await flushPromises()
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(3)
    })

    it('clears loadingMore when a filter change kicks off a replace mid-Load-more', async () => {
        // Regression: the append's `finally` was previously gated on
        // `requestId`, so a filter change that bumped the id mid-append
        // would skip the append's finally and leave `loadingMore` stuck
        // at true — the Load more button looked permanently busy until
        // the user reloaded. The fix ungates the finally because each
        // mode owns its own indicator, so resetting a superseded
        // append's flag cannot collide with the newer replace's flag.
        vi.useRealTimers()
        const page1: MediaListResponse = {
            assets: [sample, { ...sample, id: 'test-2' }],
            page: 1,
            perPage: 24,
            total: 48,
            lastPage: 2,
        }
        let resolveAppend: ((v: MediaListResponse) => void) | null = null
        const get = vi.fn()
            .mockResolvedValueOnce(page1)
            .mockReturnValueOnce(new Promise<MediaListResponse>((resolve) => {
                resolveAppend = resolve
            }))
            // The replace keeps lastPage=2 (matching the initial load)
            // so the Load more button stays mounted after the replace
            // resolves — we need it to keep rendering so the
            // `Loading…` vs `Load more` label is observable.
            .mockResolvedValueOnce({
                assets: [sample],
                page: 1,
                perPage: 24,
                total: 48,
                lastPage: 2,
            })
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-load-more-button"]').trigger('click')
        await flushPromises()
        const midButton = wrapper.find('[data-testid="media-load-more-button"]')
        expect(midButton.exists()).toBe(true)
        expect(midButton.text()).toContain('Loading…')

        // Mid-append: change the type filter — setType() calls load(),
        // which bumps requestId and starts a replace.
        await pickType(wrapper, 'image')
        await flushPromises()

        // Settle the superseded append. The (ungated) finally must run
        // and clear loadingMore even though the requestId no longer
        // matches.
        ;(resolveAppend as unknown as ((v: MediaListResponse) => void) | null)?.({
            assets: [{ ...sample, id: 'test-3' }, { ...sample, id: 'test-4' }],
            page: 2,
            perPage: 24,
            total: 48,
            lastPage: 2,
        })
        await flushPromises()

        // The Load-more spinner is gone and the label is "Load more"
        // again — the indicator that was stuck at true before the fix
        // is no longer stuck. The button itself is still disabled
        // because the replace's `loading` flag is true, which is a
        // separate indicator and is correct.
        const afterButton = wrapper.find('[data-testid="media-load-more-button"]')
        expect(afterButton.exists()).toBe(true)
        expect(afterButton.text()).not.toContain('Loading…')
        expect(afterButton.text()).toContain('Load more')
    })

    it('sends include_temporary=false on the initial list call (toggle default off)', async () => {
        const get = vi.fn().mockResolvedValueOnce(emptyList)
        const helper = buildContext(get); mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        const url = get.mock.calls.find((c) => c[0]?.startsWith('/media'))?.[0] ?? ''
        expect(url).toContain('include_temporary=false')
    })

    it('flipping the toggle reloads the grid with include_temporary=true', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(1)
        expect(get.mock.calls[0]?.[0]).toContain('include_temporary=false')

        // Click the toggle in the toolbar — it mutates the shared
        // singleton, which triggers App.vue's reload watcher.
        await wrapper.find<HTMLInputElement>('[data-testid="media-show-temporary"]').setValue(true)
        await flushPromises()
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(2)
        const url = get.mock.calls[1]?.[0] ?? ''
        expect(url).toContain('include_temporary=true')
        // The watcher resets pagination to 1 so the operator doesn't
        // land on an empty tail page if the temp set is smaller.
        expect(url).toContain('page=1')
    })

    it('flipping the toggle back off reloads with include_temporary=false', async () => {
        // Symmetric: toggling off also reloads, so a temp-filtered
        // view reverts to the canonical set without a manual refresh.
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await wrapper.find<HTMLInputElement>('[data-testid="media-show-temporary"]').setValue(true)
        await flushPromises()
        await flushPromises()
        await wrapper.find<HTMLInputElement>('[data-testid="media-show-temporary"]').setValue(false)
        await flushPromises()
        await flushPromises()
        const lastUrl = get.mock.calls.at(-1)?.[0] ?? ''
        expect(lastUrl).toContain('include_temporary=false')
    })

    it('persists the toggle across remounts so the next page load keeps the operator\'s pick', async () => {
        // The toggle is localStorage-persisted: flipping it on,
        // unmounting, and remounting with the same localStorage must
        // send include_temporary=true on the first /media call.
        const first = mount(
            App,
            { props: { hostContext: buildContext(vi.fn().mockResolvedValue(emptyList)) } },
        )
        await flushPromises()
        await flushPromises()
        await first.find<HTMLInputElement>('[data-testid="media-show-temporary"]').setValue(true)
        await flushPromises()
        await flushPromises()
        first.unmount()

        // Fresh mount — localStorage carries the `true` value.
        const get = vi.fn().mockResolvedValue(emptyList)
        mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        const firstCall = get.mock.calls.find((c) => c[0]?.startsWith('/media'))?.[0] ?? ''
        expect(firstCall).toContain('include_temporary=true')
    })

    it('sends the folder id of the picked folder', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await wrapper.find('[data-testid="media-folder-folder-1"]').trigger('click')
        await flushPromises()
        await flushPromises()
        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).toContain('folder_id=folder-1')
    })

    it('sends the picked kind', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await pickKind(wrapper, 'template')
        await flushPromises()
        await flushPromises()
        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).toContain('kind=template')
    })

    it('resets to page 1 when the folder selection changes', async () => {
        // Without the reset the panel would show page 3 of the new
        // folder's listing.
        const page3: MediaListResponse = {
            assets: [sample],
            page: 3,
            perPage: 24,
            total: 60,
            lastPage: 3,
        }
        const get = vi.fn()
            .mockResolvedValueOnce(page3)
            .mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await wrapper.find('[data-testid="media-folder-folder-1"]').trigger('click')
        await flushPromises()
        await flushPromises()
        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).toContain('page=1')
        expect(last).toContain('folder_id=folder-1')
    })

    it('drops a folder selection that the new scope cannot filter by', async () => {
        // A folder of a principal outside the scope would filter the
        // listing down to nothing, so the selection is dropped.
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await wrapper.find('[data-testid="media-folder-folder-1"]').trigger('click')
        await flushPromises()
        await flushPromises()
        await pickScope(wrapper, 202)
        await flushPromises()
        await flushPromises()
        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).not.toContain('folder_id=')
    })

    it('offers neither the kind filter nor the folder rail when the core has no folders endpoint', async () => {
        // A 404 on `GET /media/folders` means the core predates the
        // folders release: it has no folders and it ignores `?kind=`.
        // Offering a filter the server ignores is worse than offering
        // none, so the panel drops both surfaces.
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get, undefined, { foldersStatus: 404 })
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-kind-select-toggle"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-folder-rail"]').exists()).toBe(false)
    })

    it('keeps the kind filter when the folders endpoint fails for another reason', async () => {
        // Any answer other than a 404 means the route exists — the core
        // has the kinds release — so a transient failure must not take
        // the filter away.
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get, undefined, { foldersStatus: 500 })
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-kind-select-toggle"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-folder-rail"]').exists()).toBe(true)
    })

    it('probes the folders endpoint when the caller has no visible principal', async () => {
        // Without a principal there is no folder to list, so the
        // per-principal requests never fire — and without the probe the
        // panel would offer a kind filter against a core that ignores it.
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get, undefined, { principals: [], groups: [], foldersStatus: 404 })
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-kind-select-toggle"]').exists()).toBe(false)
    })
})

describe('App.vue arrangement', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        __resetShowTemporaryToggleForTesting()
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        __resetShowTemporaryToggleForTesting()
    })

    it('lays the folder rail out beside the grid', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        const rail = wrapper.find('[data-testid="media-folder-rail"]')
        expect(rail.exists()).toBe(true)
        // The tree's root lives in the rail, not in the grid column.
        expect(rail.find('[data-testid="media-folder-root"]').exists()).toBe(true)
        expect(rail.find('[data-testid="media-folder-folder-1"]').exists()).toBe(true)
    })

    it('keeps the search box and the upload button in the toolbar beside the grid', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        const main = wrapper.find('main')
        expect(main.find('[data-testid="media-search"]').exists()).toBe(true)
        expect(main.find('[data-testid="media-archive-upload-button"]').exists()).toBe(true)
        expect(main.find('[data-testid="media-type-select-toggle"]').exists()).toBe(true)
        expect(main.find('[data-testid="media-kind-select-toggle"]').exists()).toBe(true)
    })

    it('tells the grid which folder it is showing, so an empty folder is not called an empty archive', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        // The whole library is empty…
        expect(wrapper.find('[data-testid="media-grid-empty"]').text()).toContain('No media yet')
        // …but a folder that holds nothing says so.
        await wrapper.find('[data-testid="media-folder-folder-1"]').trigger('click')
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-grid-empty"]').text()).toContain('This folder is empty.')
    })

    it('opens the folder drawer from the toolbar and closes it on the backdrop', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-rail-backdrop"]').exists()).toBe(false)

        await wrapper.find('[data-testid="media-rail-open"]').trigger('click')
        expect(wrapper.find('[data-testid="media-rail-backdrop"]').exists()).toBe(true)

        await wrapper.find('[data-testid="media-rail-backdrop"]').trigger('click')
        expect(wrapper.find('[data-testid="media-rail-backdrop"]').exists()).toBe(false)
    })

    it('keeps the closed rail off-canvas', async () => {
        // The rail slides on `left`, not on a transform: the plugin ships
        // no preflight, and Tailwind's transform utilities read variables
        // its preflight defines — without them they silently do nothing.
        // The offset must therefore be in the closed state, and the open
        // state must not carry it: `left-0` and `-left-[18rem]` set the
        // same property, and the one that comes later in the generated
        // CSS wins.
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        const rail = wrapper.find('[data-testid="media-folder-rail"]')
        expect(rail.classes()).toContain('-left-[18rem]')
        expect(rail.classes()).toContain('invisible')
        expect(rail.classes()).not.toContain('left-0')

        await wrapper.find('[data-testid="media-rail-open"]').trigger('click')
        const open = wrapper.find('[data-testid="media-folder-rail"]')
        expect(open.classes()).toContain('left-0')
        expect(open.classes()).not.toContain('-left-[18rem]')
    })

    it('opens the new-folder dialog from the rail', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-new-folder-dialog"]').exists()).toBe(false)

        await wrapper.find('[data-testid="media-new-folder-button"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="media-new-folder-dialog"]').exists()).toBe(true)
    })

    it('files a dragged card into the folder it was dropped on', async () => {
        // The rail's folder rows are the drop targets: the operator
        // drags a card out of the grid and onto a folder.
        const get = vi.fn().mockImplementation((path: string) => {
            if (path === '/principals/me') {
                return Promise.resolve({ principals: defaultPrincipals })
            }
            if (path === '/groups') {
                return Promise.resolve({ groups: defaultGroups })
            }
            if (path.startsWith('/media/folders')) {
                return Promise.resolve({ folders: defaultFolders })
            }
            return Promise.resolve({
                assets: [{ id: 'asset-1', filename: 'shot.png', folder_id: null, kind: 'asset' }],
                page: 1,
                perPage: 24,
                total: 1,
                lastPage: 1,
            })
        })
        const helper = buildContext(get)
        const patch = helper.api.patch as unknown as ReturnType<typeof vi.fn>
        patch.mockResolvedValue({ id: 'asset-1', filename: 'shot.png', folder_id: 'folder-1', kind: 'asset' })
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-card-asset-1"]').trigger('dragstart')
        await wrapper.find('[data-testid="media-folder-folder-1"]').trigger('dragover')
        await wrapper.find('[data-testid="media-folder-folder-1"]').trigger('drop')
        await flushPromises()

        expect(patch).toHaveBeenCalledWith('/media/asset-1', { folder_id: 'folder-1' })
        // The whole library is listed, so the card stays in it — it is
        // only filed somewhere else.
        expect(wrapper.find('[data-testid="media-card-asset-1"]').exists()).toBe(true)
    })

    it('takes a dropped card out of the unfiled listing, because it is filed now', async () => {
        // The unfiled pile is a filtered view: an asset filed into a
        // folder is no longer among the ones filed in no folder, so the
        // row has to go — and the page behind it has to be asked for
        // again, because the rows have moved up.
        const rows: MediaAsset[] = [
            { ...sample, id: 'asset-1', principal_id: 101, folder_id: null },
            { ...sample, id: 'asset-2', principal_id: 101, folder_id: null },
        ]
        const get = vi.fn().mockImplementation((path: string) => {
            if (path === '/principals/me') {
                return Promise.resolve({ principals: defaultPrincipals })
            }
            if (path === '/groups') {
                return Promise.resolve({ groups: defaultGroups })
            }
            if (path.startsWith('/media/folders')) {
                return Promise.resolve({ folders: defaultFolders })
            }
            const unfiled = path.includes('unfiled=true')
            const assets = unfiled ? rows.filter((row) => row.folder_id === null) : rows
            return Promise.resolve({
                assets,
                page: 1,
                perPage: 24,
                total: assets.length,
                lastPage: 1,
            })
        })
        const helper = buildContext(get)
        const patch = helper.api.patch as unknown as ReturnType<typeof vi.fn>
        patch.mockImplementation((path: string) => {
            const id = path.slice('/media/'.length)
            const row = rows.find((candidate) => candidate.id === id)
            const updated = { ...row, folder_id: 'folder-1' }
            if (row !== undefined) {
                row.folder_id = 'folder-1'
            }
            return Promise.resolve(updated)
        })
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-folder-unfiled"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="media-card-asset-1"]').exists()).toBe(true)

        await wrapper.find('[data-testid="media-card-asset-1"]').trigger('dragstart')
        await wrapper.find('[data-testid="media-folder-folder-1"]').trigger('dragover')
        await wrapper.find('[data-testid="media-folder-folder-1"]').trigger('drop')
        await flushPromises()
        await flushPromises()

        expect(wrapper.find('[data-testid="media-card-asset-1"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-card-asset-2"]').exists()).toBe(true)
    })

    it('takes a dragged card out of its folder when it is dropped on the root', async () => {
        const get = vi.fn().mockImplementation((path: string) => {
            if (path === '/principals/me') {
                return Promise.resolve({ principals: defaultPrincipals })
            }
            if (path === '/groups') {
                return Promise.resolve({ groups: defaultGroups })
            }
            if (path.startsWith('/media/folders')) {
                return Promise.resolve({ folders: defaultFolders })
            }
            return Promise.resolve({
                assets: [{ id: 'asset-1', filename: 'shot.png', folder_id: 'folder-1', kind: 'asset' }],
                page: 1,
                perPage: 24,
                total: 1,
                lastPage: 1,
            })
        })
        const helper = buildContext(get)
        const patch = helper.api.patch as unknown as ReturnType<typeof vi.fn>
        patch.mockResolvedValue({ id: 'asset-1', filename: 'shot.png', folder_id: null, kind: 'asset' })
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-card-asset-1"]').trigger('dragstart')
        await wrapper.find('[data-testid="media-folder-root"]').trigger('dragover')
        await wrapper.find('[data-testid="media-folder-root"]').trigger('drop')
        await flushPromises()

        expect(patch).toHaveBeenCalledWith('/media/asset-1', { folder_id: null })
    })

    it('files a created folder under its principal and selects it', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await wrapper.find('[data-testid="media-new-folder-button"]').trigger('click')
        await flushPromises()

        const dialog = wrapper.findComponent({ name: 'MediaNewFolderDialog' })
        dialog.vm.$emit('created', {
            folder: { id: 'folder-9', name: 'Q3', path: '/Q3', parent_id: null, asset_count: 0 },
            principalId: 101,
        })
        dialog.vm.$emit('close')
        await flushPromises()
        await flushPromises()

        // The new folder joins its principal's tree…
        expect(wrapper.find('[data-testid="media-folder-folder-9"]').exists()).toBe(true)
        // …and becomes the selected folder.
        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).toContain('folder_id=folder-9')
    })
})

describe('App.vue selection', () => {
    /**
     * Two assets of the user principal, so a bulk move has something to
     * move and a bulk delete something to delete.
     */
    const twoAssets: MediaListResponse = {
        assets: [
            { ...sample, id: 'asset-1', principal_id: 101 },
            { ...sample, id: 'asset-2', principal_id: 101 },
        ],
        page: 1,
        perPage: 24,
        total: 2,
        lastPage: 1,
    }

    function buildListContext(list: MediaListResponse): {
        helper: PluginHostContext
        patch: ReturnType<typeof vi.fn>
        remove: ReturnType<typeof vi.fn>
    } {
        const get = vi.fn().mockImplementation((path: string) => {
            if (path === '/principals/me') {
                return Promise.resolve({ principals: defaultPrincipals })
            }
            if (path === '/groups') {
                return Promise.resolve({ groups: defaultGroups })
            }
            if (path.startsWith('/media/folders')) {
                return Promise.resolve({ folders: defaultFolders })
            }
            return Promise.resolve(list)
        })
        const helper = buildContext(get)
        const patch = helper.api.patch as unknown as ReturnType<typeof vi.fn>
        const remove = helper.api.delete as unknown as ReturnType<typeof vi.fn>
        patch.mockImplementation((path: string) => Promise.resolve({
            ...sample,
            id: path.slice('/media/'.length),
            principal_id: 101,
            folder_id: 'folder-1',
        }))
        remove.mockResolvedValue({ deleted: true })
        return { helper, patch, remove }
    }

    it('selects assets in the overview and counts them', async () => {
        const { helper } = buildListContext(twoAssets)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        // The selection mode is off: a click opens the detail page.
        expect(wrapper.find('[data-testid="media-selection-bar"]').exists()).toBe(false)

        await wrapper.find('[data-testid="media-selection-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-selection-bar"]').exists()).toBe(true)

        await wrapper.find('[data-testid="media-card-asset-1"]').trigger('click')
        await wrapper.find('[data-testid="media-card-asset-2"]').trigger('click')
        expect(wrapper.find('[data-testid="media-selection-count"]').text()).toContain('2 assets selected')

        // A second click takes the asset out again.
        await wrapper.find('[data-testid="media-card-asset-2"]').trigger('click')
        expect(wrapper.find('[data-testid="media-selection-count"]').text()).toContain('1 asset selected')
    })

    it('files the selected assets into a folder together', async () => {
        const { helper, patch } = buildListContext(twoAssets)
        // Into the document: the move dialog's form only submits when
        // it is attached, the way a browser does it.
        const wrapper = mount(App, { props: { hostContext: helper }, attachTo: document.body })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-selection-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-card-asset-1"]').trigger('click')
        await wrapper.find('[data-testid="media-card-asset-2"]').trigger('click')
        await wrapper.find('[data-testid="media-selection-move"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="media-move-dialog"]').exists()).toBe(true)
        await wrapper.find('[data-testid="media-move-folder-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-move-folder-option-folder-1"]').trigger('click')
        // The submit button has to be pressed the way the browser does:
        // the click has to reach the button itself, so the form submits.
        ;(wrapper.find('[data-testid="media-move-submit"]').element as HTMLButtonElement).click()
        await flushPromises()
        await flushPromises()

        expect(patch).toHaveBeenCalledTimes(2)
        expect(patch).toHaveBeenCalledWith('/media/asset-1', { folder_id: 'folder-1' })
        expect(patch).toHaveBeenCalledWith('/media/asset-2', { folder_id: 'folder-1' })
        // The selection is spent.
        expect(wrapper.find('[data-testid="media-selection-bar"]').exists()).toBe(false)
        // The operator is told what happened.
        expect(wrapper.find('[data-testid="media-toast"]').text()).toContain('2 assets moved.')
        wrapper.unmount()
    })

    it('deletes the selected assets, but only after the confirmation', async () => {
        const { helper, remove } = buildListContext(twoAssets)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-selection-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-card-asset-1"]').trigger('click')
        await wrapper.find('[data-testid="media-card-asset-2"]').trigger('click')
        await wrapper.find('[data-testid="media-selection-delete"]').trigger('click')
        await flushPromises()

        // The confirmation is up, and nothing is deleted yet.
        expect(wrapper.find('[data-testid="delete-confirm-dialog"]').exists()).toBe(true)
        expect(remove).not.toHaveBeenCalled()

        await wrapper.find('[data-testid="delete-cancel"]').trigger('click')
        expect(remove).not.toHaveBeenCalled()

        await wrapper.find('[data-testid="media-selection-delete"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="delete-confirm"]').trigger('click')
        await flushPromises()
        await flushPromises()

        expect(remove).toHaveBeenCalledTimes(2)
        expect(remove).toHaveBeenCalledWith('/media/asset-1')
        expect(remove).toHaveBeenCalledWith('/media/asset-2')
    })

    it('leaves the selection mode when the operator cancels', async () => {
        const { helper } = buildListContext(twoAssets)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-selection-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-card-asset-1"]').trigger('click')
        await wrapper.find('[data-testid="media-selection-cancel"]').trigger('click')

        expect(wrapper.find('[data-testid="media-selection-bar"]').exists()).toBe(false)
        // The mode is off too, so a click opens the detail page again.
        expect(wrapper.find('[data-testid="media-selection-toggle"]').exists()).toBe(true)
    })
})

describe('App.vue the unfiled slice', () => {
    it('asks for the assets filed in no folder', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-folder-unfiled"]').trigger('click')
        await flushPromises()

        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).toContain('unfiled=true')
        expect(last).not.toContain('folder_id=')
    })

    it('keeps the unfiled slice when the scope changes', async () => {
        // The unfiled slice names no folder, so it survives a scope
        // change — the folder filter does not.
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get)
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="media-folder-unfiled"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="media-scope-option-101"]').trigger('click')
        await flushPromises()

        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).toContain('unfiled=true')
    })
})
