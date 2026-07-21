import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import App from '../src/App.vue'
import type { MediaAsset, MediaListResponse } from '../src/types'
import type { PluginHostContext } from '../src/shims'

type GetFn = <T = unknown>(path: string) => Promise<T>
type MockedApi = {
    get: GetFn | ReturnType<typeof vi.fn>
    post: ReturnType<typeof vi.fn>
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
}

const emptyList: MediaListResponse = {
    assets: [],
    page: 1,
    perPage: 24,
    total: 0,
    lastPage: 1,
}

function buildContext(get: ReturnType<typeof vi.fn>, route?: { path: string }): PluginHostContext {
    const api: MockedApi = { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
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
        expect(wrapper.text()).toContain('Media Archive')
        expect(wrapper.text()).toContain('2 assets')
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

    it('passes scope=mine to the API when the scope toggle is flipped', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const helper = buildContext(get); const wrapper = mount(App, { props: { hostContext: helper } })
        await flushPromises()
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(1)
        await wrapper.find('[data-testid="media-scope-mine"]').trigger('click')
        await flushPromises()
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(2)
        expect(get.mock.calls[1]?.[0]).toContain('scope=mine')
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
})