import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import App from '../src/App.vue'
import MediaFilters from '../src/components/MediaFilters.vue'
import type {
    MediaAsset,
    MediaGroup,
    MediaListResponse,
    MediaPrincipal,
} from '../src/types'
import type { PluginHostContext } from '../src/shims'

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
    markdown_content: null,
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
 * call resolves with. The plugin only reads `id` and `name`; the rest
 * is here to mirror the wire shape from `GET /principals/me` and
 * `GET /groups` so a future consumer that grows the panel doesn't
 * have to rewire every test.
 */
const defaultPrincipals: MediaPrincipal[] = [
    { id: 101, type: 'user', user_id: 1, group_id: null },
    { id: 202, type: 'group', user_id: null, group_id: 10 },
]
const defaultGroups: MediaGroup[] = [
    { id: 10, name: 'Marketing Team', principal_id: 202 },
]

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
    mediaHandlers?: { principals?: MediaPrincipal[]; groups?: MediaGroup[] },
): PluginHostContext {
    const principals = mediaHandlers?.principals ?? defaultPrincipals
    const groups = mediaHandlers?.groups ?? defaultGroups
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
        theme: 'light',
        route: { path: initialPath, params: {}, query: {} } as unknown as PluginHostContext['route'],
        router: router as unknown as PluginHostContext['router'],
    }
}

describe('App.vue', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
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
        // Three API calls: /principals/me, /groups, /media.
        expect(get).toHaveBeenCalledTimes(1)
        // The plugin calls /media?page=1&per_page=24 — no filters.
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

    it('renders scope chips from /principals/me + /groups', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        // Scope to the actual chip selector — `media-scope-chips` is the
        // container div, not a chip, and would otherwise inflate the count.
        const chips = wrapper.findAll('[data-testid^="media-scope-"]:not([data-testid="media-scope-chips"])')
        // Default fixtures: ALL, My Media (user principal 101), Group A
        // (group principal 202 = "Marketing Team") = 3 chips.
        expect(chips).toHaveLength(3)
        expect(wrapper.find('[data-testid="media-scope-all"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-101"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-202"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-202"]').text()).toContain('Marketing Team')
    })

    it('labels the user-principal chip as "My Media", never as "Group #N"', () => {
        // Regression for the bug where the user-principal was rendered
        // with the `Group #${id}` fallback label because the frontend
        // lost the `type` discriminator before MediaFilters could read
        // it. The dashboard's own `My Agents` chip never had this bug
        // — we should match its visual contract.
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [
                    { id: 1, type: 'user', user_id: 1, group_id: null },
                    { id: 5, type: 'group', user_id: null, group_id: 4 },
                ],
                selectedScope: null,
                groupLabels: {},
            },
        })
        // The user-principal chip is data-testid="media-scope-1" but
        // its label must say "My Media" regardless of the id number.
        expect(wrapper.find('[data-testid="media-scope-1"]').text()).toContain('My Media')
        expect(wrapper.find('[data-testid="media-scope-1"]').text()).not.toContain('Group #1')
        // The group-principal chip falls back to `Group #5` because no
        // /groups entry keyed principal_id=5 was provided.
        expect(wrapper.find('[data-testid="media-scope-5"]').text()).toContain('Group #5')
    })

    it('omits the scope chip row when the user has no visible principals', async () => {
        // A brand-new user with no groups: the chip row should hide
        // entirely so the user isn't staring at an empty `ALL` button.
        // The grid still works (the API falls back to the legacy
        // ownership union).
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get, undefined, { principals: [], groups: [] })
        const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-scope-chips"]').exists()).toBe(false)
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

    it('sends a single principal_id when a group chip is clicked', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await wrapper.find('[data-testid="media-scope-202"]').trigger('click')
        await flushPromises()
        await flushPromises()
        const last = get.mock.calls.at(-1)?.[0] ?? ''
        expect(last).toContain('principal_id%5B%5D=202')
        // The user-principal must NOT be sent alongside the group chip
        // — picking a specific group means "only this group", and the
        // server's `includeUploads` branch would otherwise leak the
        // user's own uploads into the per-group view.
        expect(last).not.toContain('principal_id%5B%5D=101')
    })

    it('resets scope to ALL when the active chip is clicked again', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        await wrapper.find('[data-testid="media-scope-202"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="media-scope-202"]').trigger('click')
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
        await wrapper.find('[data-testid="media-type-image"]').trigger('click')
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
        await wrapper.find('[data-testid="media-type-image"]').trigger('click')
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
        expect(get.mock.calls.at(-1)?.[0]).toContain('search=alpine')
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

    it('updates the matching card when the detail page emits updated', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
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
        // The dialog teleports to <body> for fixed-position centring,
        // so query the live document, not the wrapper.
        expect(document.querySelector('[data-testid="media-upload-dialog"]')).toBeTruthy()
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
})
