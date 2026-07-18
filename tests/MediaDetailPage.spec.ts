import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MediaDetailPage from '../src/pages/MediaDetailPage.vue'
import type { MediaAsset } from '../src/types'
import type { PluginHostContext } from '../src/shims'

function buildHostContext(get: ReturnType<typeof vi.fn>): {
    hostContext: PluginHostContext
    api: {
        get: ReturnType<typeof vi.fn>
        post: ReturnType<typeof vi.fn>
        patch: ReturnType<typeof vi.fn>
        delete: ReturnType<typeof vi.fn>
    }
} {
    const api = {
        get,
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    }
    const hostContext: PluginHostContext = {
        api: api as unknown as PluginHostContext['api'],
        pinia: null,
        theme: 'light',
        route: null,
        router: null,
    }
    return { hostContext, api }
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

afterEach(() => {
    vi.restoreAllMocks()
})

describe('MediaDetailPage', () => {
    it('fetches the asset on mount and renders filename', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, filename: 'pixel.png' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(get).toHaveBeenCalledWith(`/media/${sample.id}`)
        expect(wrapper.find('[data-testid="media-detail-filename"]').text()).toContain('pixel.png')
    })

    it('shows a loading indicator while the request is pending', async () => {
        const get = vi.fn().mockReturnValueOnce(new Promise<MediaAsset>(() => {}))
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.text()).toContain('Loading asset')
    })

    it('surfaces the fetch error message in-page', async () => {
        const get = vi.fn().mockRejectedValueOnce(new Error('not found'))
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.text()).toContain('not found')
    })

    it('copies the asset UUID to the clipboard', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-uuid"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith(sample.id)
        expect(wrapper.text()).toContain('UUID copied')
    })

    it('copies the filename when set, falls back to the UUID', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const get = vi.fn().mockResolvedValueOnce({ ...sample, filename: 'shot.png' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-filename"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith('shot.png')
    })

    it('enables public sharing when the toggle is on', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext, api } = buildHostContext(get)
        api.patch.mockResolvedValue({ ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=abc' })
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        const toggle = wrapper.find('[data-testid="public-sharing-toggle"]')
        await toggle.setValue(true)
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { public_access_enabled: true })
        expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ public_url: expect.stringContaining('?token=abc') })
    })

    it('saves the filename inline edit', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext, api } = buildHostContext(get)
        api.patch.mockResolvedValue({ ...sample, filename: 'renamed.png' })
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('h2.cursor-pointer').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        await input.setValue('renamed.png')
        const form = input.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { filename: 'renamed.png' })
    })

    it('opens the delete dialog and emits delete on confirm', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext, api } = buildHostContext(get)
        api.delete.mockResolvedValue(undefined)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="media-page-delete"]').trigger('click')
        await flushPromises()
        const dialog = wrapper.find('[data-testid="delete-confirm-dialog"]').element as HTMLDialogElement
        expect(dialog.open).toBe(true)
        await wrapper.find('[data-testid="delete-confirm"]').trigger('click')
        await flushPromises()
        expect(api.delete).toHaveBeenCalledWith(`/media/${sample.id}`)
        expect(wrapper.emitted('deleted')?.[0]?.[0]).toBe(sample.id)
    })

    it('falls back to a synthesized download name when filename is null', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, filename: null })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        const download = wrapper.find('a[data-testid="media-page-download"]')
        expect(download.attributes('download')).toBe('minimax-test-1.png')
    })

    it('shows the markdown extraction badge when has_markdown is true', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, has_markdown: true })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.text()).toContain('Extracted')
    })

    it('refetches when the assetId prop changes', async () => {
        const get = vi.fn()
            .mockResolvedValueOnce(sample)
            .mockResolvedValueOnce({ ...sample, id: 'test-2', filename: 'two.png' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(1)
        await wrapper.setProps({ assetId: 'test-2' })
        await flushPromises()
        expect(get).toHaveBeenCalledTimes(2)
        expect(get.mock.calls[1]?.[0]).toBe('/media/test-2')
        expect(wrapper.find('[data-testid="media-detail-filename"]').text()).toContain('two.png')
    })

    it('does not render a download link for non-image assets without a preview block', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, media_type: 'audio', mime_type: 'audio/mpeg' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.find('[data-testid="media-page-audio"]').exists()).toBe(true)
    })

    it('renders the video preview for video media', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, media_type: 'video', mime_type: 'video/mp4' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.find('[data-testid="media-page-video"]').exists()).toBe(true)
    })

    it('renders the dimensions row when width and height are set', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.text()).toContain('64 × 64')
    })

    it('renders the duration row when duration_seconds is set', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, duration_seconds: 12.5 })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.text()).toContain('12.50s')
    })

    it('renders the source URL row when source_url is set', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, source_url: 'https://example.com/foo.png' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        const link = wrapper.find('a[href="https://example.com/foo.png"]')
        expect(link.exists()).toBe(true)
        expect(link.attributes('rel')).toBe('noopener noreferrer')
    })

    it('refuses an unsafe source URL scheme', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, source_url: 'javascript:alert(1)' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('Invalid source URL')
    })

    it('opens the tags edit form when the tags button is clicked', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, tags: ['draft', 'redacted'] })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.text()).toContain('draft, redacted')
        await wrapper.find('[data-testid="tags-edit-button"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('input[placeholder^="tag1"]').exists()).toBe(true)
    })

    it('saves the prompt inline edit', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext, api } = buildHostContext(get)
        api.patch.mockResolvedValue({ ...sample, prompt: 'updated' })
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="prompt-edit-button"]').trigger('click')
        await flushPromises()
        const textarea = wrapper.find('textarea')
        await textarea.setValue('updated')
        const form = textarea.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { prompt: 'updated' })
    })

    it('disables public sharing when the toggle is off', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=old' })
        const { hostContext, api } = buildHostContext(get)
        api.patch.mockResolvedValue({ ...sample, public_url: null })
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="public-sharing-toggle"]').setValue(false)
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { public_access_enabled: false })
    })

    it('refreshes the public-access token', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=old' })
        const { hostContext, api } = buildHostContext(get)
        api.post.mockResolvedValue({ ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=fresh' })
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="refresh-public-token"]').trigger('click')
        await flushPromises()
        expect(api.post).toHaveBeenCalledWith(`/media/${sample.id}/public-token/refresh`, undefined)
    })

    it('copies the public URL to the clipboard when the share section is open', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const url = 'https://example.test/api/v1/public/media/' + sample.id + '?token=abc'
        const get = vi.fn().mockResolvedValueOnce({ ...sample, public_url: url })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-public-url"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith(url)
    })

    it('cancels the delete dialog without issuing a DELETE', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext, api } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="media-page-delete"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="delete-cancel"]').trigger('click')
        await flushPromises()
        expect(api.delete).not.toHaveBeenCalled()
        expect(wrapper.emitted('deleted')).toBeUndefined()
    })
})