import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../src/App.vue'
import type { MediaAsset, MediaListResponse, PluginHostContext } from '../src/types'

const sample: MediaAsset = {
    id: 'test-1',
    media_type: 'image',
    mime_type: 'image/png',
    byte_size: 4096,
    width: 64,
    height: 64,
    duration_seconds: null,
    prompt: 'a tiny pixel',
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
    return {
        api: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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
        resolveFn?.(emptyList)
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
})