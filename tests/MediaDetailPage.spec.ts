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

    it('shows no markdown extraction badge or metadata row', async () => {
        const get = vi.fn().mockResolvedValueOnce({ ...sample })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        expect(wrapper.text()).not.toContain('Extracted')
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

    it('pins a definite height on the image figure so the image is never cropped', async () => {
        // Regression: `max-h-[80vh]` is an auto height, so the img's percentage
        // `max-h-full` computed to `none` and the image overflowed.
        const get = vi.fn().mockResolvedValueOnce({ ...sample, width: 4000, height: 6000 })
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()

        const figureClasses = wrapper.find('[data-testid="media-preview-figure"]').classes()
        expect(figureClasses.some((c) => /^h-\[.+\]$/.test(c))).toBe(true)
        expect(figureClasses.some((c) => c.startsWith('max-h-['))).toBe(false)
        expect(figureClasses).toContain('overflow-hidden')
        expect(wrapper.find('[data-testid="media-preview-img"]').classes()).toContain('object-contain')
    })

    it('lays the preview and the details out side by side on desktop', async () => {
        const get = vi.fn().mockResolvedValueOnce(sample)
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()

        const layout = wrapper.find('[data-testid="media-detail-layout"]')
        expect(layout.exists()).toBe(true)
        // Equal tracks: portrait/square images are height-bound, so a wider
        // preview column is dead space (measured 58% / 37% of the box unused).
        expect(layout.classes()).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')
        expect(layout.classes()).toContain('items-start')

        const previewColumn = wrapper.find('[data-testid="media-detail-preview-column"]')
        const infoColumn = wrapper.find('[data-testid="media-detail-info-column"]')
        expect(previewColumn.exists()).toBe(true)
        expect(infoColumn.exists()).toBe(true)
        expect(previewColumn.find('[data-testid="media-preview-figure"]').exists()).toBe(true)
        expect(infoColumn.find('[data-testid="media-page-download"]').exists()).toBe(true)
        expect(previewColumn.find('[data-testid="media-page-download"]').exists()).toBe(false)
        expect(wrapper.html().indexOf('media-detail-preview-column'))
            .toBeLessThan(wrapper.html().indexOf('media-detail-info-column'))
    })

    it('keeps the no-preview fallback compact and gives the operator a way out', async () => {
        const get = vi.fn()
            .mockResolvedValueOnce({
                ...sample,
                media_type: 'document',
                mime_type: 'application/pdf',
                asset_url: '/api/v1/assets/test-1.pdf',
            })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()

        const fallback = wrapper.find('[data-testid="media-preview-fallback"]')
        expect(fallback.exists()).toBe(true)
        const classes = fallback.classes()
        expect(classes).not.toContain('aspect-video')
        expect(classes.some((c) => /^h-\[.+\]$/.test(c))).toBe(false)
        expect(classes).toContain('self-start')
        expect(fallback.text()).toContain('document')

        const download = fallback.find('[data-testid="media-preview-fallback-download"]')
        expect(download.attributes('href')).toBe('/api/v1/assets/test-1.pdf')
        const open = fallback.find('[data-testid="media-preview-fallback-open"]')
        expect(open.attributes('href')).toBe('/api/v1/assets/test-1.pdf')
        expect(open.attributes('target')).toBe('_blank')
        expect(open.attributes('rel')).toBe('noopener')
    })

    it('downloads the selected derivative instead of the source file', async () => {
        const derivative = makeImageDerivative({ format: 'png' })
        const get = vi.fn()
            .mockResolvedValueOnce({ ...sample, filename: 'shot.pdf', derivatives: [derivative] })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()

        const source = wrapper.find('a[data-testid="media-page-download"]')
        expect(source.attributes('href')).toBe(sample.asset_url)
        expect(source.attributes('download')).toBe('shot.pdf')
        expect(source.text()).toContain('Download')
        expect(source.text()).not.toContain('derivative')

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()

        // shot.pdf + png → shot.png, not shot.pdf.png.
        const swapped = wrapper.find('a[data-testid="media-page-download"]')
        expect(swapped.attributes('href')).toBe(derivative.asset_url)
        expect(swapped.attributes('download')).toBe('shot.png')
        expect(swapped.text()).toContain('PNG derivative')

        await wrapper.find('[data-testid="versions-source"]').trigger('click')
        await flushPromises()
        const restored = wrapper.find('a[data-testid="media-page-download"]')
        expect(restored.attributes('href')).toBe(sample.asset_url)
        expect(restored.attributes('download')).toBe('shot.pdf')
    })

    it('synthesizes a derivative download name when the asset has no filename', async () => {
        const derivative = makeImageDerivative({ format: 'thumbnail-256' })
        const get = vi.fn()
            .mockResolvedValueOnce({ ...sample, filename: null, derivatives: [derivative] })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('a[data-testid="media-page-download"]').attributes('download'))
            .toBe('minimax-test-1.thumbnail-256')
    })

    it('downloads the derivative from the PDF preview card too', async () => {
        // Regression: `:download` received `previewAlt` — the prompt, not a
        // filename.
        const pdfDerivative: MediaDerivative = {
            format: 'pdf',
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
                filename: 'paper.typ',
                derivatives: [pdfDerivative],
            })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()
        const card = wrapper.find('[data-testid="media-preview-pdf-download"]')
        expect(card.attributes('href')).toBe(pdfDerivative.asset_url)
        expect(card.attributes('download')).toBe('paper.pdf')
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
        // Regression: PR #33 dropped `autofocus`, so the operator had to
        // click twice. Fix template-refs the input and focuses it on nextTick.
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
        // select() so the first keystroke replaces the whole string.
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

    it('treats any text/* source as a text preview, verbatim', async () => {
        for (const mimeType of ['text/plain', 'text/x-typst', 'text/csv']) {
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
            expect(wrapper.find('[data-testid="media-preview-markdown"]').exists()).toBe(false)

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
        vi.useRealTimers()
        let resolveOldFetch: ((response: Response) => void) | null = null
        const fetchMock = vi.fn()
            .mockReturnValueOnce(new Promise<Response>((resolve) => {
                resolveOldFetch = resolve
            }))
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: () => Promise.resolve('FRESH body'),
            })
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
        expect(wrapper.find('[data-testid="media-preview-text-loading"]').exists()).toBe(true)
        await wrapper.setProps({ assetId: textAsset2.id })
        await flushPromises()
        ;(resolveOldFetch as unknown as ((response: Response) => void) | null)?.({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: () => Promise.resolve('STALE body'),
        } as unknown as Response)
        await flushPromises()
        await flushPromises()
        expect(wrapper.text()).not.toContain('STALE')
        expect(fetchMock.mock.calls.map((c) => c[0])).toContain(textAsset2.asset_url)
        expect(wrapper.find('[data-testid="media-preview-text-body"]').text()).toBe('FRESH body')
        const err = wrapper.find('[data-testid="media-preview-text-error"]')
        expect(err.exists()).toBe(false)

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

describe('MediaDetailPage — md derivative preview', () => {
    const PDF_SOURCE: MediaAsset = {
        ...sample,
        id: 'doc-1',
        media_type: 'document',
        mime_type: 'application/pdf',
        filename: 'report.pdf',
        asset_url: '/api/v1/assets/doc-1.pdf',
    }

    function makeMarkdownDerivative(overrides: Partial<MediaDerivative> = {}): MediaDerivative {
        return {
            format: 'md',
            label: 'Markdown',
            media_id: 'derivative-md-1',
            asset_url: '/api/v1/assets/derivative-md-1.md',
            mime_type: 'text/markdown',
            producer_plugin: 'spora-core',
            producer_operation: 'pdf_to_markdown',
            created_at: '2026-01-01T00:00:01.000Z',
            ...overrides,
        }
    }

    function mountWithDerivatives(derivatives: MediaDerivative[], bodies: Record<string, string>) {
        const fetchMock = vi.fn((url: string) => {
            const body = bodies[url] ?? `no body registered for ${url}`
            return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) })
        })
        vi.stubGlobal('fetch', fetchMock)

        const get = vi.fn()
            .mockResolvedValueOnce({ ...PDF_SOURCE, derivatives })
            // VersionsStrip fires the options endpoint on mount.
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: PDF_SOURCE.id, hostContext } })
        return { wrapper, fetchMock }
    }

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('resolves a text kind for an md derivative from its mime, not the format slug', async () => {
        const derivative = makeMarkdownDerivative()
        const { wrapper } = mountWithDerivatives([derivative], {
            [derivative.asset_url]: '# Quarterly\n\nRevenue up 12%.',
        })
        await flushPromises()
        await flushPromises()

        expect(wrapper.find('[data-testid="media-preview-fallback"]').exists()).toBe(true)

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()
        await flushPromises()

        expect(wrapper.find('[data-testid="media-preview-text"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-preview-fallback"]').exists()).toBe(false)
    })

    it('reads the derivative mime rather than the md slug, so an md-format binary does not render as text', async () => {
        const derivative = makeMarkdownDerivative({ mime_type: 'application/octet-stream' })
        const { wrapper, fetchMock } = mountWithDerivatives([derivative], {})
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="media-preview-text"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-preview-fallback"]').exists()).toBe(true)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('falls back to the format slug when the core sends no derivative mime_type', async () => {
        const derivative = makeMarkdownDerivative({ mime_type: null })
        const { wrapper } = mountWithDerivatives([derivative], {
            [derivative.asset_url]: '# Title',
        })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()
        await flushPromises()

        expect(wrapper.find('[data-testid="media-preview-text"]').exists()).toBe(true)
    })

    it('previews a non-markdown text derivative verbatim', async () => {
        const derivative = makeMarkdownDerivative({
            format: 'csv',
            mime_type: 'text/csv',
            asset_url: '/api/v1/assets/derivative-csv-1.csv',
        })
        const { wrapper } = mountWithDerivatives([derivative], {
            [derivative.asset_url]: 'a,b\n1,2',
        })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()
        await flushPromises()

        expect(wrapper.find('[data-testid="media-preview-text-raw"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-preview-text-body"]').text()).toBe('a,b\n1,2')
        expect(wrapper.find('[data-testid="media-preview-markdown"]').exists()).toBe(false)
    })

    it('fetches the selected derivative URL, not the source asset URL', async () => {
        const derivative = makeMarkdownDerivative()
        const { wrapper, fetchMock } = mountWithDerivatives([derivative], {
            [derivative.asset_url]: 'derivative body',
            [PDF_SOURCE.asset_url]: 'source body',
        })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()
        await flushPromises()

        const urls = fetchMock.mock.calls.map((c) => c[0])
        expect(urls).toContain(derivative.asset_url)
        expect(urls).not.toContain(PDF_SOURCE.asset_url)
        expect(wrapper.find('[data-testid="media-preview-markdown"]').text()).toContain('derivative body')
    })

    it('refetches when the operator switches from one text derivative to another', async () => {
        const first = makeMarkdownDerivative()
        const second = makeMarkdownDerivative({
            media_id: 'derivative-md-2',
            asset_url: '/api/v1/assets/derivative-md-2.md',
        })
        const { wrapper } = mountWithDerivatives([first, second], {
            [first.asset_url]: 'FIRST body',
            [second.asset_url]: 'SECOND body',
        })
        await flushPromises()
        await flushPromises()

        const chips = wrapper.findAll('[data-testid="versions-derivative-chip"]')
        expect(chips).toHaveLength(2)

        await chips[0]!.trigger('click')
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-preview-markdown"]').text()).toContain('FIRST body')

        await chips[1]!.trigger('click')
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-testid="media-preview-markdown"]').text()).toContain('SECOND body')
        expect(wrapper.text()).not.toContain('FIRST body')
    })

    it('refetches the source bytes when the operator returns to the Source chip', async () => {
        const derivative = makeMarkdownDerivative()
        const { wrapper, fetchMock } = mountWithDerivatives([derivative], {
            [derivative.asset_url]: 'derivative body',
            [PDF_SOURCE.asset_url]: 'source body',
        })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()
        await flushPromises()
        expect(wrapper.text()).toContain('derivative body')

        await wrapper.find('[data-testid="versions-source"]').trigger('click')
        await flushPromises()
        await flushPromises()

        expect(wrapper.find('[data-testid="media-preview-fallback"]').exists()).toBe(true)
        expect(wrapper.text()).not.toContain('derivative body')
        expect(fetchMock).not.toHaveBeenCalledWith(PDF_SOURCE.asset_url, expect.anything())
    })

    it('discards an in-flight derivative fetch when the chip changes mid-flight', async () => {
        let resolveFirst: ((response: unknown) => void) | null = null
        const first = makeMarkdownDerivative()
        const second = makeMarkdownDerivative({
            media_id: 'derivative-md-2',
            asset_url: '/api/v1/assets/derivative-md-2.md',
        })
        const fetchMock = vi.fn((url: string) => {
            if (url === first.asset_url) {
                return new Promise((resolve) => {
                    resolveFirst = resolve
                })
            }
            return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('SECOND body') })
        })
        vi.stubGlobal('fetch', fetchMock)

        const get = vi.fn()
            .mockResolvedValueOnce({ ...PDF_SOURCE, derivatives: [first, second] })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: PDF_SOURCE.id, hostContext } })
        await flushPromises()
        await flushPromises()

        const chips = wrapper.findAll('[data-testid="versions-derivative-chip"]')
        await chips[0]!.trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="media-preview-text-loading"]').exists()).toBe(true)

        await chips[1]!.trigger('click')
        await flushPromises()
        await flushPromises()
        ;(resolveFirst as unknown as ((response: unknown) => void) | null)?.({
            ok: true,
            status: 200,
            text: () => Promise.resolve('STALE first body'),
        })
        await flushPromises()
        await flushPromises()

        expect(wrapper.find('[data-testid="media-preview-markdown"]').text()).toContain('SECOND body')
        expect(wrapper.text()).not.toContain('STALE')
    })

    it('renders the md derivative as markdown, not a raw <pre>', async () => {
        const derivative = makeMarkdownDerivative()
        const { wrapper } = mountWithDerivatives([derivative], {
            [derivative.asset_url]: '# Quarterly Earnings\n\nRevenue grew **12%**.\n\n- Cloud: +18%\n',
        })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()
        await flushPromises()

        const markdown = wrapper.find('[data-testid="media-preview-markdown"]')
        expect(markdown.exists()).toBe(true)
        const rendered = markdown.find('[data-md-preview="true"]')
        expect(rendered.exists()).toBe(true)
        expect(rendered.text()).toContain('# Quarterly Earnings')
        expect(wrapper.find('[data-testid="media-preview-text-raw"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-preview-text-body"]').exists()).toBe(false)
    })

    it('renders a markdown-typed source in the preview pane too', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: () => Promise.resolve('# Source\n\nbody'),
        }))
        const get = vi.fn()
            .mockResolvedValueOnce({
                ...sample,
                media_type: 'document',
                mime_type: 'text/markdown',
                derivatives: [],
            })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: sample.id, hostContext } })
        await flushPromises()
        await flushPromises()
        await flushPromises()

        expect(wrapper.find('[data-testid="media-preview-markdown"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-preview-text-raw"]').exists()).toBe(false)
    })

    it('surfaces the text-fetch error for a derivative too', async () => {
        const derivative = makeMarkdownDerivative()
        vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network down')))
        const get = vi.fn()
            .mockResolvedValueOnce({ ...PDF_SOURCE, derivatives: [derivative] })
            .mockResolvedValueOnce([])
        const { hostContext } = buildHostContext(get)
        const wrapper = mount(MediaDetailPage, { props: { assetId: PDF_SOURCE.id, hostContext } })
        await flushPromises()
        await flushPromises()

        await wrapper.find('[data-testid="versions-derivative-chip"]').trigger('click')
        await flushPromises()
        await flushPromises()

        const err = wrapper.find('[data-testid="media-preview-text-error"]')
        expect(err.exists()).toBe(true)
        expect(err.text()).toContain('network down')
        expect(wrapper.find('[data-testid="media-preview-markdown"]').exists()).toBe(false)
    })
})
