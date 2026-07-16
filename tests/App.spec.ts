import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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

function buildContext(get: ReturnType<typeof vi.fn>): PluginHostContext {
    const api: MockedApi = { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
    return {
        // The shim expects a typed callable. Cast through `unknown` to keep
        // the test ergonomics (no need to re-declare the generic at every
        // call site) while satisfying vue-tsc's stricter overload check.
        api: api as unknown as PluginHostContext['api'],
        pinia: null,
        theme: 'light',
        route: null,
        router: null,
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
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
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
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
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
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.text()).toContain('10 assets')
    })

    it('passes scope=mine to the API when the scope toggle is flipped', async () => {
        const get = vi.fn().mockResolvedValue(emptyList)
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
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
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
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
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
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
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
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
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
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
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        await wrapper.find('[data-testid="media-search"]').setValue('alpine')
        await flushPromises()
        await flushPromises()
        expect(get.mock.calls.at(-1)?.[0]).toContain('search=alpine')
    })

    it('opens the detail drawer when a card is selected', async () => {
        const get = vi.fn().mockResolvedValue({
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 1,
            lastPage: 1,
        })
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-drawer"]').exists()).toBe(false)
        await wrapper.find(`[data-testid="media-card-${sample.id}"]`).trigger('click')
        expect(wrapper.find('[data-testid="media-drawer"]').exists()).toBe(true)
    })

    it('closes the detail drawer when the close event fires', async () => {
        const get = vi.fn().mockResolvedValue({
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 1,
            lastPage: 1,
        })
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        await wrapper.find(`[data-testid="media-card-${sample.id}"]`).trigger('click')
        await wrapper.find('[data-testid="media-drawer-close"]').trigger('click')
        expect(wrapper.find('[data-testid="media-drawer"]').exists()).toBe(false)
    })

    it('updates the matching card when the drawer emits updated', async () => {
        const get = vi.fn().mockResolvedValue({
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 1,
            lastPage: 1,
        })
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        // Open the drawer so the child component is mounted and `selected`
        // is populated (this is the branch `onAssetUpdated` exercises).
        await wrapper.find(`[data-testid="media-card-${sample.id}"]`).trigger('click')
        await flushPromises()
        const drawer = wrapper.findComponent({ name: 'MediaDetailDrawer' })
        const renamed: MediaAsset = { ...sample, filename: 'renamed.png' }
        drawer.vm.$emit('updated', renamed)
        await flushPromises()
        // The asset prop on the open drawer reflects the updated record,
        // which is sufficient proof that `onAssetUpdated` ran (it both
        // updates the grid and replaces the selected asset).
        expect(drawer.props('asset')).toMatchObject({ filename: 'renamed.png' })
    })

    it('replaces the selected asset when an updated event arrives for the open asset', async () => {
        const get = vi.fn().mockResolvedValue({
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 1,
            lastPage: 1,
        })
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        // Open the drawer for the sample asset.
        await wrapper.find(`[data-testid="media-card-${sample.id}"]`).trigger('click')
        await flushPromises()
        const drawer = wrapper.findComponent({ name: 'MediaDetailDrawer' })
        const renamed: MediaAsset = { ...sample, filename: 'open-and-renamed.png' }
        drawer.vm.$emit('updated', renamed)
        await flushPromises()
        // The drawer must now reflect the new filename (drawn from
        // `selected`, which `onAssetUpdated` replaced).
        expect(drawer.props('asset')).toMatchObject({ filename: 'open-and-renamed.png' })
    })

    it('ignores updated events for an asset that is not in the list', async () => {
        const second: MediaAsset = { ...sample, id: 'test-2' }
        const get = vi.fn().mockResolvedValue({
            assets: [sample, second],
            page: 1,
            perPage: 24,
            total: 2,
            lastPage: 1,
        })
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        // Open the drawer for `sample` so `selected` is set.
        await wrapper.find(`[data-testid="media-card-${sample.id}"]`).trigger('click')
        await flushPromises()
        const drawer = wrapper.findComponent({ name: 'MediaDetailDrawer' })
        // Emit `updated` for an unrelated id — neither matches `selected`
        // nor exists in the asset list.
        drawer.vm.$emit('updated', { ...sample, id: 'unrelated', filename: 'ghost.png' })
        await flushPromises()
        // Drawer remains open with the original sample (selected was not
        // replaced), and the grid still has only the original two cards.
        expect(drawer.props('asset')).toMatchObject({ id: sample.id, filename: null })
        expect(wrapper.findAll(`[data-testid="media-card-${sample.id}"]`)).toHaveLength(1)
        expect(wrapper.findAll(`[data-testid="media-card-${second.id}"]`)).toHaveLength(1)
    })

    it('removes the asset, decrements total, and closes the drawer on delete', async () => {
        const second: MediaAsset = { ...sample, id: 'test-2' }
        const get = vi.fn().mockResolvedValue({
            assets: [sample, second],
            page: 1,
            perPage: 24,
            total: 2,
            lastPage: 1,
        })
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.text()).toContain('2 assets')
        // Open the drawer for the first asset so `selected` is set; the
        // deleted handler must then clear it.
        await wrapper.find(`[data-testid="media-card-${sample.id}"]`).trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="media-drawer"]').exists()).toBe(true)
        const drawer = wrapper.findComponent({ name: 'MediaDetailDrawer' })
        drawer.vm.$emit('deleted', sample.id)
        await flushPromises()
        // Drawer closed, grid shows only the second card, total dropped.
        expect(wrapper.find('[data-testid="media-drawer"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('1 asset')
        expect(wrapper.findAll(`[data-testid="media-card-${sample.id}"]`)).toHaveLength(0)
        expect(wrapper.findAll(`[data-testid="media-card-${second.id}"]`)).toHaveLength(1)
    })

    it('clamps total at zero when delete fires for a phantom id', async () => {
        // Defensive: the parent never sends a phantom id, but the handler
        // uses `Math.max(0, total - 1)` so a rogue event cannot drive
        // total negative. This guards that branch.
        const get = vi.fn().mockResolvedValue({
            assets: [sample],
            page: 1,
            perPage: 24,
            total: 0,
            lastPage: 1,
        })
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
        await flushPromises()
        await flushPromises()
        // Open the drawer so the child is mounted (and the `deleted` event
        // can be emitted from a real component instance).
        await wrapper.find(`[data-testid="media-card-${sample.id}"]`).trigger('click')
        await flushPromises()
        const drawer = wrapper.findComponent({ name: 'MediaDetailDrawer' })
        drawer.vm.$emit('deleted', 'phantom-id')
        await flushPromises()
        expect(wrapper.text()).toContain('0 assets')
    })

    it('invalidates pending requests when unmounted before the response arrives', async () => {
        vi.useRealTimers()
        let resolveFn: ((v: MediaListResponse) => void) | null = null
        const get = vi.fn().mockReturnValueOnce(
            new Promise<MediaListResponse>((resolve) => {
                resolveFn = resolve
            }),
        )
        const wrapper = mount(App, { props: { hostContext: buildContext(get) } })
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
})