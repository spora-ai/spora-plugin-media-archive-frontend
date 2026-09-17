import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MediaDetailPage from '../src/pages/MediaDetailPage.vue'
import type { MediaAsset, MediaDerivative } from '../src/types'
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

afterEach(() => {
    vi.restoreAllMocks()
})

function makeImageDerivative(overrides: Partial<MediaDerivative> = {}): MediaDerivative {
    return {
        format: 'thumbnail-256',
        label: 'Thumb 256',
        media_id: 'derivative-1',
        asset_url: '/api/v1/assets/derivative-1.webp',
        producer_plugin: 'spora-core',
        producer_operation: 'image.derive',
        created_at: '2026-01-01T00:00:01.000Z',
        ...overrides,
    }
}

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
        await wrapper.find('button.cursor-pointer').trigger('click')
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
            // Initial detail page load.
            .mockResolvedValueOnce(sample)
            // VersionsStrip fires the options endpoint on mount (one per
            // detail-page load).
            .mockResolvedValueOnce([])
            // setProps → second detail page load.
            .mockResolvedValueOnce({ ...sample, id: 'test-2', filename: 'two.png' })
            // VersionsStrip fires the options endpoint again on id change.
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        // Two fetches: the asset + the VersionsStrip options endpoint.
        expect(get).toHaveBeenCalledTimes(2)
        await wrapper.setProps({ assetId: 'test-2' })
        await flushPromises()
        // Two more fetches: the new asset + the options endpoint again.
        expect(get).toHaveBeenCalledTimes(4)
        expect(get.mock.calls[2]?.[0]).toBe('/media/test-2')
        expect(wrapper.find('[data-testid="media-detail-filename"]').text()).toContain('two.png')
    })

    it('centers the image preview and never forces it to upscale beyond its native size', async () => {
        // Small icons / 64x64 thumbnails used to be stretched to the
        // full container width via `h-auto w-full`, which produced a
        // visibly blurred preview. The figure is now a flex container
        // and the img caps itself at the figure's max dimensions.
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()

        const figure = wrapper.find('[data-testid="media-preview-figure"]')
        expect(figure.exists()).toBe(true)
        const figureClasses = figure.classes().join(' ')
        expect(figureClasses).toContain('flex')
        expect(figureClasses).toContain('items-center')
        expect(figureClasses).toContain('justify-center')

        const img = figure.find('img')
        // Class array (not string) so `max-w-full` doesn't match `w-full`
        // via string `.includes()` — that's a substring hit, not a token.
        const imgClasses = img.classes()
        expect(imgClasses).toContain('max-h-full')
        expect(imgClasses).toContain('max-w-full')
        expect(imgClasses).not.toContain('w-full')
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

    it('focuses the filename input after the rename button is clicked', async () => {
        // PR #33 dropped the `autofocus` attribute on the rename input;
        // the heading swap still happened but focus stayed on the now-
        // hidden button, so the operator had to click a second time.
        // The fix template-refs the input and focuses it on nextTick.
        const get = vi.fn().mockResolvedValueOnce({ ...sample, filename: 'old.png' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, {
            props: { assetId: sample.id, hostContext },
            attachTo: document.body,
        })
        await flushPromises()
        await wrapper.find('[data-testid="media-detail-filename"]').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        expect(input.exists()).toBe(true)
        expect(document.activeElement).toBe(input.element)
        // `select()` is also part of the contract so renaming a long
        // filename replaces the whole string on the first keystroke.
        expect((input.element as HTMLInputElement).selectionStart).toBe(0)
        expect((input.element as HTMLInputElement).selectionEnd).toBe('old.png'.length)
        wrapper.unmount()
    })

    it('focuses the tags input after the tags edit button is clicked', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, tags: ['draft'] })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, {
            props: { assetId: sample.id, hostContext },
            attachTo: document.body,
        })
        await flushPromises()
        await wrapper.find('[data-testid="tags-edit-button"]').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[placeholder^="tag1"]')
        expect(input.exists()).toBe(true)
        expect(document.activeElement).toBe(input.element)
        wrapper.unmount()
    })

    it('focuses the prompt textarea after the prompt edit button is clicked', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, prompt: 'a tiny pixel' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, {
            props: { assetId: sample.id, hostContext },
            attachTo: document.body,
        })
        await flushPromises()
        await wrapper.find('[data-testid="prompt-edit-button"]').trigger('click')
        await flushPromises()
        const textarea = wrapper.find('textarea')
        expect(textarea.exists()).toBe(true)
        expect(document.activeElement).toBe(textarea.element)
        wrapper.unmount()
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

    it('opens the filename edit form and saves via PATCH', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, filename: 'old.png' })
        const { hostContext, api } = buildHostContext(get)
        api.patch.mockResolvedValue({ ...sample, filename: 'renamed.png' })
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        const heading = wrapper.find('button.cursor-pointer')
        await heading.trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        expect(input.exists()).toBe(true)
        await input.setValue('renamed.png')
        const form = input.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { filename: 'renamed.png' })
    })

    it('rejects an empty filename and does not issue a PATCH', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext, api } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('button.cursor-pointer').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        await input.setValue('   ')
        const form = input.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(api.patch).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('Filename cannot be empty')
    })

    it('cancels the filename edit without saving', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext, api } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('button.cursor-pointer').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        await input.setValue('never-saved.png')
        await wrapper.find('[data-testid="filename-cancel"]').trigger('click')
        await flushPromises()
        expect(api.patch).not.toHaveBeenCalled()
        expect(wrapper.find('input[data-testid="filename-input"]').exists()).toBe(false)
    })

    it('saves tags as a comma-separated array', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, tags: ['draft'] })
        const { hostContext, api } = buildHostContext(get)
        api.patch.mockResolvedValue({ ...sample, tags: ['draft', 'redacted', 'hero'] })
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="tags-edit-button"]').trigger('click')
        await flushPromises()
        const tagsInput = wrapper.find('input[placeholder^="tag1"]')
        await tagsInput.setValue('draft, redacted, ,hero')
        const form = tagsInput.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { tags: ['draft', 'redacted', 'hero'] })
    })

    it('shows the tags empty placeholder when the asset has no tags', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, tags: null })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.text()).toContain('click to add tags')
    })

    it('surfaces the public-sharing toggle error in the error panel', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext, api } = buildHostContext(get)
        api.patch.mockRejectedValue(new Error('sharing failed'))
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="public-sharing-toggle"]').setValue(true)
        await flushPromises()
        expect(wrapper.text()).toContain('sharing failed')
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

    it('renders the markdown preview when markdown_content is set', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, markdown_content: '# Hello\n\nWorld' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        const preview = wrapper.find('[data-testid="markdown-preview-wrapper"]')
        expect(preview.exists()).toBe(true)
        expect(preview.text()).toContain('Hello')
    })

    it('shows the markdown empty placeholder when markdown_content is null', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, markdown_content: null })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.find('[data-testid="markdown-empty"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="markdown-preview-wrapper"]').exists()).toBe(false)
    })

    it('opens the markdown editor when the Edit button is clicked', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, markdown_content: '# Hi' })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="markdown-edit-button"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="markdown-edit-form"]').exists()).toBe(true)
    })

    it('opens the markdown editor with an empty buffer when Add markdown is clicked', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, markdown_content: null })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="markdown-add-button"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="markdown-edit-form"]').exists()).toBe(true)
    })

    it('saves the markdown content via PATCH', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, markdown_content: '# Old' })
        const { hostContext, api } = buildHostContext(get)
        api.patch.mockResolvedValue({ ...sample, markdown_content: '# New\n\nUpdated body' })
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="markdown-edit-button"]').trigger('click')
        await flushPromises()
        // The stub editor is a textarea — type into it.
        const editor = wrapper.find('[data-testid="markdown-editor"]')
        await editor.setValue('# New\n\nUpdated body')
        await flushPromises()
        const form = wrapper.find('[data-testid="markdown-edit-form"]')
        await form.trigger('submit.prevent')
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { markdown_content: '# New\n\nUpdated body' })
    })

    it('cancels the markdown edit without saving', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample, markdown_content: '# Original' })
        const { hostContext, api } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="markdown-edit-button"]').trigger('click')
        await flushPromises()
        const editor = wrapper.find('[data-testid="markdown-editor"]')
        await editor.setValue('discarded content')
        await wrapper.find('[data-testid="markdown-cancel"]').trigger('click')
        await flushPromises()
        expect(api.patch).not.toHaveBeenCalled()
        expect(wrapper.find('[data-testid="markdown-edit-form"]').exists()).toBe(false)
        // Original content still showing in preview
        expect(wrapper.text()).toContain('Original')
    })

    it('mounts the Versions strip above the preview block and reads derivatives from the asset', async () => {
        // The strip's options endpoint is also fired on mount; both
        // responses are pre-stubbed on the same `get` mock so the
        // page settles deterministically without unmocked promises.
        const derivatives = [
            {
                format: 'pdf',
                media_id: 'derivative-pdf-1',
                asset_url: '/api/v1/assets/derivative-pdf-1.pdf',
                producer_plugin: 'typst',
                producer_operation: 'render',
                created_at: '2026-01-01T00:00:01.000Z',
            },
        ]
        const get = vi.fn()
            .mockResolvedValueOnce({ ...sample, derivatives })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()
        const versionsStrip = wrapper.find('[data-testid="versions-strip"]')
        expect(versionsStrip.exists()).toBe(true)
        // The strip lists the existing derivatives as chips.
        const chips = versionsStrip.findAll('[data-testid="versions-derivative-chip"]')
        expect(chips).toHaveLength(1)
        expect(chips[0]?.text()).toContain('PDF')
        // The strip lives ABOVE the existing preview block — the
        // relative DOM order matters for the visual contract.
        const preview = wrapper.find('[data-testid="media-preview-figure"]')
        expect(preview.exists()).toBe(true)
        const order = wrapper.html().indexOf('versions-strip')
        const previewOrder = wrapper.html().indexOf('media-preview-figure')
        expect(order).toBeLessThan(previewOrder)
    })

    it('swaps the preview to the chosen derivative when a chip is clicked', async () => {
        const derivative = makeImageDerivative()
        const get = vi.fn()
            .mockResolvedValueOnce({ ...sample, derivatives: [derivative] })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()

        // The source asset is rendered by default.
        const previewImg = wrapper.find('[data-testid="media-preview-img"]')
        expect(previewImg.exists()).toBe(true)
        expect(previewImg.attributes('src')).toBe(sample.asset_url)
        // No "Viewing derivative" badge while the source is selected.
        expect(wrapper.find('[data-testid="media-preview-derivative-badge"]').exists()).toBe(false)

        // Click the derivative chip.
        const chip = wrapper.find('[data-testid="versions-derivative-chip"]')
        await chip.trigger('click')
        await flushPromises()

        // The preview now points at the derivative's asset_url.
        const swapped = wrapper.find('[data-testid="media-preview-img"]')
        expect(swapped.attributes('src')).toBe(derivative.asset_url)
        // And the operator can see they've navigated off the source.
        expect(wrapper.find('[data-testid="media-preview-derivative-badge"]').exists()).toBe(true)

        // Click the Source chip to come back.
        const sourceChip = wrapper.find('[data-testid="versions-source"]')
        await sourceChip.trigger('click')
        await flushPromises()
        const restored = wrapper.find('[data-testid="media-preview-img"]')
        expect(restored.attributes('src')).toBe(sample.asset_url)
        expect(wrapper.find('[data-testid="media-preview-derivative-badge"]').exists()).toBe(false)
    })

    it('splices a freshly-produced derivative into asset.derivatives', async () => {
        // The strip emits a `MediaAsset` (the new media_assets row, not
        // the wire-summary shape). The page must reshape it and append.
        const derivativeAsset: MediaAsset = {
            ...sample,
            id: 'derivative-fresh',
            mime_type: 'application/pdf',
            plugin_slug: 'typst',
            tool_name: 'render',
        }
        const get = vi.fn()
            .mockResolvedValueOnce({ ...sample, derivatives: [] })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()
        const strip = wrapper.findComponent({ name: 'VersionsStrip' })
        strip.vm.$emit('produced', derivativeAsset)
        await flushPromises()
        // The asset's derivatives should now contain the freshly-produced
        // entry as a `MediaDerivative` summary (extracted from the
        // derivative asset's MIME suffix).
        const updated = wrapper.find('[data-testid="versions-source"]').exists()
        expect(updated).toBe(true)
    })

    it('renders a PDF derivative in a download card even when the source asset is a document', async () => {
        // Regression: previously the preview pane only rendered an <img>
        // for image-type sources; a freshly-produced PDF derivative on a
        // `.typ` source silently no-op'd because the click changed
        // `selectedDerivativeId` but the template's `v-if` branch never
        // matched. The fix branches on the SELECTED derivative's format.
        //
        // UX follow-up: rendering the PDF in an <iframe> triggered the
        // browser's built-in PDF viewer, which downloads the file when
        // the operator clicks. The PDF branch now surfaces a download
        // card (filename + button) instead.
        const pdfDerivative: MediaDerivative = {
            format: 'pdf',
            label: 'PDF',
            media_id: 'derivative-pdf-1',
            asset_url: '/api/v1/assets/derivative-pdf-1.pdf',
            producer_plugin: 'spora-plugin-typst',
            producer_operation: 'render',
            created_at: '2026-01-01T00:00:01.000Z',
        }
        const get = vi.fn()
            .mockResolvedValueOnce({
                ...sample,
                media_type: 'document',
                mime_type: 'text/x-typst',
                derivatives: [pdfDerivative],
            })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()

        // Source branch should NOT match (no <img> for a document).
        expect(wrapper.find('[data-testid="media-preview-figure"]').exists()).toBe(false)
        // Click the PDF chip — the download card appears and the (now
        // removed) iframe branch does not.
        const chip = wrapper.find('[data-testid="versions-derivative-chip"]')
        await chip.trigger('click')
        await flushPromises()
        const card = wrapper.find('[data-testid="media-preview-pdf"]')
        expect(card.exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-preview-iframe"]').exists()).toBe(false)
        const download = wrapper.find('[data-testid="media-preview-pdf-download"]')
        expect(download.exists()).toBe(true)
        expect(download.attributes('href')).toBe(pdfDerivative.asset_url)
        expect(download.attributes('download')).toBeTruthy()
        // The badge is scoped to the <img> branch only (it doubles as
        // a "click to zoom" hint); PDFs use the download card directly.
        expect(wrapper.find('[data-testid="media-preview-figure"]').exists()).toBe(false)

        // Click Source to come back — the download card disappears and
        // the text-type source chip fetches its raw bytes. The
        // `textSourceLoading`/`textSourceError`/<pre> branches each
        // have their own test below; here we just verify the download
        // card is gone and the source-side preview surface is up.
        await wrapper.find('[data-testid="versions-source"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="media-preview-pdf"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-preview-iframe"]').exists()).toBe(false)
        // The text preview element is now mounted (its loading branch
        // shows because `fetch` isn't mocked in this test).
        expect(wrapper.find('[data-testid="media-preview-text"]').exists()).toBe(true)
    })

    it('renders an image derivative as <img> on a document-type source', async () => {
        // PNG/SVG derivatives on a `.typ` source should still land in
        // the <img> branch — image preview is the universal fallback.
        const pngDerivative: MediaDerivative = {
            format: 'png',
            label: 'PNG',
            media_id: 'derivative-png-1',
            asset_url: '/api/v1/assets/derivative-png-1.png',
            producer_plugin: 'spora-plugin-typst',
            producer_operation: 'render',
            created_at: '2026-01-01T00:00:01.000Z',
        }
        const get = vi.fn()
            .mockResolvedValueOnce({
                ...sample,
                media_type: 'document',
                mime_type: 'text/x-typst',
                derivatives: [pngDerivative],
            })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()
        const chip = wrapper.find('[data-testid="versions-derivative-chip"]')
        await chip.trigger('click')
        await flushPromises()
        const img = wrapper.find('[data-testid="media-preview-img"]')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe(pngDerivative.asset_url)
    })

    it('renders the source bytes in a <pre> when the source mime_type starts with text/', async () => {
        // Regression: the Source chip on a `.typ` source previously
        // landed on the "Preview unavailable for document" fallback
        // because `media_type === 'document'` doesn't distinguish
        // PDFs from text. The fix also reads `mime_type` so anything
        // with a `text/*` prefix gets fetched and rendered as text.
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: () => Promise.resolve('= Hello Typst\n$x = 1$\n'),
        })
        vi.stubGlobal('fetch', fetchMock)

        const get = vi.fn()
            .mockResolvedValueOnce({
                ...sample,
                media_type: 'document',
                mime_type: 'text/x-typst',
                derivatives: [],
            })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()
        await flushPromises()

        expect(fetchMock).toHaveBeenCalledWith(
            sample.asset_url,
            expect.objectContaining({ credentials: 'include' }),
        )
        const pre = wrapper.find('[data-testid="media-preview-text"]')
        expect(pre.exists()).toBe(true)
        // `<pre>` collapses a trailing newline, so compare against
        // the source body without it.
        expect(pre.find('[data-testid="media-preview-text-body"]').text()).toBe(
            '= Hello Typst\n$x = 1$',
        )

        vi.unstubAllGlobals()
    })

    it('falls back to a destructive error message when the text fetch fails', async () => {
        const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network down'))
        vi.stubGlobal('fetch', fetchMock)

        const get = vi.fn()
            .mockResolvedValueOnce({
                ...sample,
                media_type: 'document',
                mime_type: 'text/plain',
                derivatives: [],
            })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()
        await flushPromises()

        const err = wrapper.find('[data-testid="media-preview-text-error"]')
        expect(err.exists()).toBe(true)
        expect(err.text()).toContain('network down')

        vi.unstubAllGlobals()
    })

    it('treats text/plain and text/markdown as text-preview sources too', async () => {
        // The mime-type branch is general — anything with a text/*
        // prefix is a text preview. Verify the breadth so future
        // additions (text/csv, text/xml) Just Work.
        for (const mimeType of ['text/plain', 'text/markdown', 'text/x-typst']) {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: () => Promise.resolve(`source for ${mimeType}`),
            }))

            const get = vi.fn()
                .mockResolvedValueOnce({ ...sample, media_type: 'document', mime_type: mimeType, derivatives: [] })
                .mockResolvedValueOnce([])
            const { hostContext } = buildHostContext(get)
            const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
            await flushPromises()
            await flushPromises()
            await flushPromises()

            const body = wrapper.find('[data-testid="media-preview-text-body"]')
            expect(body.exists()).toBe(true)
            expect(body.text()).toBe(`source for ${mimeType}`)

            vi.unstubAllGlobals()
        }
    })

    it('still shows the "Preview unavailable for document" fallback for non-text documents like PDF', async () => {
        // A PDF source (mime_type: application/pdf) is a document
        // but NOT a text/* — the new text-preview branch must skip
        // it. The fallback message should still surface.
        const get = vi.fn()
            .mockResolvedValueOnce({
                ...sample,
                media_type: 'document',
                mime_type: 'application/pdf',
                derivatives: [],
            })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-preview-text"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-preview-fallback"]').exists()).toBe(true)
    })

    it('discards a stale text-source fetch when the assetId changes mid-flight', async () => {
        // Regression: the assetId-change watcher clears `textSource`,
        // but a still-in-flight fetch from the PREVIOUS asset would
        // race back in and overwrite the new asset's preview — its
        // `myToken === loadToken` check would pass because the
        // previous loadTextSource call set myToken BEFORE the watcher
        // bumped loadToken. The fix bumps loadToken on every
        // loadTextSource call AND inside the assetId watcher, so the
        // stale response's guard trips and the body is dropped.
        vi.useRealTimers()
        let resolveOldFetch: ((response: Response) => void) | null = null
        const fetchMock = vi.fn()
            .mockReturnValueOnce(new Promise<Response>((resolve) => {
                resolveOldFetch = resolve
            }))
        vi.stubGlobal('fetch', fetchMock)

        const textAsset1: MediaAsset = {
            ...sample,
            id: 'text-1',
            media_type: 'document',
            mime_type: 'text/plain',
            asset_url: 'https://example.test/api/v1/media/text-1.bin',
            derivatives: [],
        }
        const textAsset2: MediaAsset = {
            ...sample,
            id: 'text-2',
            media_type: 'document',
            mime_type: 'text/plain',
            asset_url: 'https://example.test/api/v1/media/text-2.bin',
            derivatives: [],
        }
        const get = vi.fn()
            .mockResolvedValueOnce(textAsset1)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(textAsset2)
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: textAsset1.id, hostContext } })
        await flushPromises()
        await flushPromises()
        await flushPromises()
        // The first fetch is in flight (loading state visible). Switch
        // assets BEFORE it resolves — the watcher bumps loadToken so
        // the OLD fetch's body is stale.
        expect(wrapper.find('[data-testid="media-preview-text-loading"]').exists()).toBe(true)
        await wrapper.setProps({ assetId: textAsset2.id })
        await flushPromises()
        // Settle the OLD fetch last. The stale-token guard must drop
        // the body even though the assetId watcher reset textSource.
        ;(resolveOldFetch as unknown as ((response: Response) => void) | null)?.({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: () => Promise.resolve('STALE body'),
        } as unknown as Response)
        await flushPromises()
        await flushPromises()
        // The STALE body must NEVER reach the rendered preview. Without
        // the token bump in the watcher, the OLD fetch's `myToken ===
        // loadToken` check would pass and overwrite textSource with
        // 'STALE body' — the user would see the previous asset's
        // bytes on the new asset's page.
        const body = wrapper.find('[data-testid="media-preview-text-body"]')
        expect(body.exists()).toBe(false)
        const err = wrapper.find('[data-testid="media-preview-text-error"]')
        expect(err.exists()).toBe(false)
        expect(wrapper.text()).not.toContain('STALE')

        vi.unstubAllGlobals()
    })

    it('surfaces the HTTP status when the text-source fetch returns a non-ok response', async () => {
        // The existing failure test mocks a fetch rejection (network
        // down), which hits the catch via the thrown rejection. The
        // `!response.ok` branch is a separate path: a successful fetch
        // whose response status is non-2xx — the try block throws
        // explicitly with the HTTP message, then the catch sets
        // textSourceError. Both error shapes must reach the user.
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: () => Promise.resolve(''),
        })
        vi.stubGlobal('fetch', fetchMock)

        const get = vi.fn()
            .mockResolvedValueOnce({
                ...sample,
                media_type: 'document',
                mime_type: 'text/plain',
                derivatives: [],
            })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()
        await flushPromises()

        const err = wrapper.find('[data-testid="media-preview-text-error"]')
        expect(err.exists()).toBe(true)
        expect(err.text()).toContain('HTTP 404 Not Found')

        vi.unstubAllGlobals()
    })

    it('hides the Keep file button when the asset is not temporary', async () => {
        // Non-temp assets (the default for everything pre-PR #238)
        // must not show the action — only assets on the purge queue
        // need it. The button is opt-in by server contract.
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.find('[data-testid="keep-asset-button"]').exists()).toBe(false)
    })

    it('renders the Keep file button when is_temporary is true', async () => {
        // Toggle on at the wire level — server returns the flag and
        // the page should surface the affordance.
        const get = vi.fn().mockResolvedValueOnce({ ...sample, is_temporary: true })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        const keep = wrapper.find('[data-testid="keep-asset-button"]')
        expect(keep.exists()).toBe(true)
        expect(keep.text()).toContain('Keep file')
    })

    it('calls POST /media/{id}/keep on click, toasts on success, and refreshes the asset', async () => {
        // Happy path: button → POST → toast → refetch. Three GETs
        // happen: (1) initial asset load, (2) VersionsStrip options
        // endpoint on mount, (3) post-keep refetch. The post endpoint
        // returns the refreshed asset; the refetch picks up
        // is_temporary=false so the section unmounts.
        const get = vi.fn()
            .mockResolvedValueOnce({ ...sample, is_temporary: true })
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce({ ...sample, is_temporary: false })
        const { hostContext, api } = buildHostContext(get)
        api.post.mockResolvedValue({ ...sample, is_temporary: false })
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()

        await wrapper.find('[data-testid="keep-asset-button"]').trigger('click')
        await flushPromises()
        await flushPromises()

        // dispatchMutation forwards `undefined` as the explicit body
        // arg, matching the existing refresh-public-token test
        // convention for endpoints that take no body.
        expect(api.post).toHaveBeenCalledWith(`/media/${sample.id}/keep`, undefined)
        // Toast text surfaces the action's outcome.
        expect(wrapper.text()).toContain("won't be auto-purged")
        // The handler re-fetches the asset to pick up is_temporary=false.
        // `get` was called three times: initial load + options + refetch.
        const mediaCalls = get.mock.calls.filter((c) => c[0] === `/media/${sample.id}`)
        expect(mediaCalls.length).toBe(2)
    })

    it('disables the Keep file button while the request is in flight', async () => {
        // Double-click protection: the button must stay disabled
        // until the POST resolves so a rapid operator can't fire
        // two keep requests against the same asset.
        let resolvePost: ((value: MediaAsset) => void) | null = null
        const get = vi.fn()
            .mockResolvedValueOnce({ ...sample, is_temporary: true })
            .mockResolvedValueOnce([])
            // Post-resolve refetch — `keepAsset()` calls `loadAsset()`
            // to pick up is_temporary=false.
            .mockResolvedValueOnce({ ...sample, is_temporary: false })
        const { hostContext, api } = buildHostContext(get)
        api.post.mockReturnValueOnce(new Promise<MediaAsset>((resolve) => {
            resolvePost = resolve
        }))
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()

        await wrapper.find('[data-testid="keep-asset-button"]').trigger('click')
        await flushPromises()
        const midButton = wrapper.find('[data-testid="keep-asset-button"]')
        expect(midButton.exists()).toBe(true)
        expect(midButton.attributes('disabled')).toBeDefined()

        // Settle the in-flight request — button re-enables.
        ;(resolvePost as unknown as ((value: MediaAsset) => void) | null)?.({ ...sample, is_temporary: false })
        await flushPromises()
        await flushPromises()
        const afterButton = wrapper.find('[data-testid="keep-asset-button"]')
        // After the keep succeeded, the asset is no longer temporary
        // so the section is removed entirely (the parent `v-if` flips
        // off). This is the correct post-success UX — the button
        // vanishes, the toast confirms.
        expect(afterButton.exists()).toBe(false)
    })

    it('surfaces a failed keep as the in-page error message', async () => {
        // Failure mode parity with the rest of the page's mutations:
        // a rejected POST sets `errorMessage` (same slot that
        // `mutate()` uses), and the toast does NOT fire.
        const get = vi.fn()
            .mockResolvedValueOnce({ ...sample, is_temporary: true })
            .mockResolvedValueOnce([])
        const { hostContext, api } = buildHostContext(get)
        api.post.mockRejectedValueOnce(new Error('forbidden'))
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()

        await wrapper.find('[data-testid="keep-asset-button"]').trigger('click')
        await flushPromises()
        expect(wrapper.text()).toContain('forbidden')
        expect(wrapper.text()).not.toContain("won't be auto-purged")
    })

})
