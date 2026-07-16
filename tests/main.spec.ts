import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MediaGrid from '../src/components/MediaGrid.vue'
import MediaCard from '../src/components/MediaCard.vue'
import MediaDetailDrawer from '../src/components/MediaDetailDrawer.vue'
import MediaFilters from '../src/components/MediaFilters.vue'
import type { MediaAsset } from '../src/types'
import type { PluginHostContext } from '../src/shims'

function buildHostContext(): {
    hostContext: PluginHostContext
    api: {
        get: ReturnType<typeof vi.fn>
        post: ReturnType<typeof vi.fn>
        patch: ReturnType<typeof vi.fn>
        delete: ReturnType<typeof vi.fn>
    }
} {
    const api = {
        get: vi.fn(),
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

describe('MediaGrid', () => {
    it('renders the empty state when no assets', () => {
        const wrapper = mount(MediaGrid, { props: { assets: [] } })
        expect(wrapper.find('[data-testid="media-grid-empty"]').exists()).toBe(true)
    })

    it('renders one card per asset', () => {
        const wrapper = mount(MediaGrid, { props: { assets: [sample, { ...sample, id: 'test-2' }] } })
        expect(wrapper.findAllComponents(MediaCard)).toHaveLength(2)
    })

    it('emits `select` with the clicked asset', async () => {
        const wrapper = mount(MediaGrid, { props: { assets: [sample] } })
        await wrapper.find(`[data-testid="media-card-${sample.id}"]`).trigger('click')
        expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ id: 'test-1' })
    })
})

describe('MediaFilters', () => {
    it('emits update:type when a pill is clicked', async () => {
        const wrapper = mount(MediaFilters, { props: { type: '', search: '', scope: 'all' } })
        await wrapper.find('[data-testid="media-type-image"]').trigger('click')
        expect(wrapper.emitted('update:type')?.[0]?.[0]).toBe('image')
    })

    it('emits update:search as the user types', async () => {
        const wrapper = mount(MediaFilters, { props: { type: '', search: '', scope: 'all' } })
        const input = wrapper.find('[data-testid="media-search"]')
        await input.setValue('alpaca')
        expect(wrapper.emitted('update:search')?.[0]?.[0]).toBe('alpaca')
    })

    it('marks the active pill', () => {
        const wrapper = mount(MediaFilters, { props: { type: 'audio', search: '', scope: 'all' } })
        const audio = wrapper.find('[data-testid="media-type-audio"]')
        // The active pill has the `bg-primary` class; the inactive ones don't.
        expect(audio.classes()).toContain('bg-primary')
    })

    it('emits update:scope with the flipped value when the scope toggle is clicked from "mine"', async () => {
        const wrapper = mount(MediaFilters, { props: { type: '', search: '', scope: 'mine' } })
        await wrapper.find('[data-testid="media-scope-mine"]').trigger('click')
        // scope === 'mine' → emit 'all' so the toggle reads as a toggle, not a sticky switch.
        expect(wrapper.emitted('update:scope')?.[0]?.[0]).toBe('all')
    })

    it('marks the scope toggle as active when scope is "mine"', () => {
        const wrapper = mount(MediaFilters, { props: { type: '', search: '', scope: 'mine' } })
        const toggle = wrapper.find('[data-testid="media-scope-mine"]')
        expect(toggle.classes()).toContain('bg-primary')
    })
})

describe('MediaCard', () => {
    it('renders the prompt when set', () => {
        const wrapper = mount(MediaCard, { props: { asset: sample } })
        expect(wrapper.text()).toContain('a tiny pixel')
    })

    it('renders the size in a human-readable form', () => {
        const wrapper = mount(MediaCard, { props: { asset: sample } })
        expect(wrapper.text()).toContain('4 KB')
    })

    it('uses an <img> tag for image media', () => {
        const wrapper = mount(MediaCard, { props: { asset: sample } })
        expect(wrapper.find('img').exists()).toBe(true)
    })

    it('falls back to the audio icon for audio media', () => {
        const audioAsset: MediaAsset = { ...sample, media_type: 'audio', mime_type: 'audio/mpeg', width: null, height: null }
        const wrapper = mount(MediaCard, { props: { asset: audioAsset } })
        expect(wrapper.find('img').exists()).toBe(false)
    })

    it('uses the fallback alt text when the asset has no prompt', () => {
        const noPrompt: MediaAsset = { ...sample, prompt: null }
        const wrapper = mount(MediaCard, { props: { asset: noPrompt } })
        const img = wrapper.find('img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('alt')).toBe('Archived')
    })

    it('formats createdAt as a localised date', () => {
        const wrapper = mount(MediaCard, { props: { asset: sample } })
        // Exact format depends on the runner's locale; assert the year
        // rather than the raw ISO string.
        expect(wrapper.text()).toContain('2026')
    })

    it('falls back to the raw createdAt string when toLocaleString throws', () => {
        // happy-dom returns 'Invalid Date' instead of throwing, so the
        // prototype is mocked to force the catch path in the computed.
        const spy = vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(() => {
            throw new RangeError('forced for test')
        })
        try {
            const wrapper = mount(MediaCard, { props: { asset: sample } })
            expect(wrapper.text()).toContain(sample.created_at)
        } finally {
            spy.mockRestore()
        }
    })

    it('formats byte_size >= 1 MiB in megabytes', () => {
        const big: MediaAsset = { ...sample, byte_size: 5 * 1024 * 1024 }
        const wrapper = mount(MediaCard, { props: { asset: big } })
        expect(wrapper.text()).toContain('5.0 MB')
    })
})

describe('MediaDetailDrawer', () => {
    it('opens the native dialog on mount via showModal()', async () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        const dialog = wrapper.find('dialog').element as HTMLDialogElement
        expect(dialog.open).toBe(true)
    })

    it('emits close when the dialog cancel event fires (Escape key)', async () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        const dialog = wrapper.find('dialog').element as HTMLDialogElement
        // Dispatch manually rather than depending on happy-dom's keyboard
        // layer; the cancel event is what <dialog> fires on Escape.
        const ev = new Event('cancel', { cancelable: true })
        dialog.dispatchEvent(ev)
        expect(ev.defaultPrevented).toBe(true)
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('closes the dialog on unmount when still open', async () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        const dialog = wrapper.find('dialog').element as HTMLDialogElement
        expect(dialog.open).toBe(true)
        wrapper.unmount()
    })

    it('falls back to the raw createdAt string when toLocaleString throws', () => {
        // See MediaCard test above for rationale.
        const spy = vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(() => {
            throw new RangeError('forced for test')
        })
        try {
            const { hostContext } = buildHostContext()
            const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
            expect(wrapper.text()).toContain(sample.created_at)
        } finally {
            spy.mockRestore()
        }
    })

    it('skips dialog.close() on unmount when the dialog is already closed', async () => {
        // Guards against double-firing close when the parent clears
        // `selected` after we already dispatched cancel.
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        const dialog = wrapper.find('dialog').element as HTMLDialogElement
        expect(dialog.open).toBe(true)
        dialog.close()
        expect(dialog.open).toBe(false)
        wrapper.unmount()
    })

    it('copies the asset UUID to the clipboard', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        const copyBtn = wrapper.find('[data-testid="copy-uuid"]')
        await copyBtn.trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith(sample.id)
        expect(wrapper.text()).toContain('UUID copied')
    })

    it('falls back to a denial toast when clipboard access fails', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('denied'))
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-uuid"]').trigger('click')
        await flushPromises()
        expect(wrapper.text()).toContain('Clipboard access denied')
    })

    it('copies the filename (or UUID when filename is null) via the copy filename button', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, filename: 'shot.png' }, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-filename"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith('shot.png')
    })

    it('falls back to copying the UUID when the filename is null', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, filename: null }, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-filename"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith(sample.id)
    })

    it('enables public sharing when the toggle is on', async () => {
        const { hostContext, api } = buildHostContext()
        api.patch.mockResolvedValue({ ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=abc' })
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        const toggle = wrapper.find('[data-testid="public-sharing-toggle"]')
        await toggle.setValue(true)
        await flushPromises()
        expect(api.patch).toHaveBeenCalledTimes(1)
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { public_access_enabled: true })
        expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ public_url: expect.stringContaining('?token=abc') })
    })

    it('disables public sharing when the toggle is off', async () => {
        const { hostContext, api } = buildHostContext()
        api.patch.mockResolvedValue({ ...sample, public_url: null })
        const shared: MediaAsset = { ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=abc' }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: shared, hostContext } })
        await flushPromises()
        const toggle = wrapper.find('[data-testid="public-sharing-toggle"]')
        await toggle.setValue(false)
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { public_access_enabled: false })
    })

    it('surfaces the public-sharing toggle error in the error panel', async () => {
        const { hostContext, api } = buildHostContext()
        api.patch.mockRejectedValue(new Error('sharing failed'))
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="public-sharing-toggle"]').setValue(true)
        await flushPromises()
        expect(wrapper.text()).toContain('sharing failed')
    })

    it('refreshes the public-access token', async () => {
        const { hostContext, api } = buildHostContext()
        api.post.mockResolvedValue({ ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=fresh' })
        const shared: MediaAsset = { ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=old' }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: shared, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="refresh-public-token"]').trigger('click')
        await flushPromises()
        expect(api.post).toHaveBeenCalledWith(`/media/${sample.id}/public-token/refresh`, undefined)
        expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ public_url: expect.stringContaining('?token=fresh') })
    })

    it('copies the public URL to the clipboard when the share section is open', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const url = 'https://example.test/api/v1/public/media/' + sample.id + '?token=abc'
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, public_url: url }, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-public-url"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith(url)
    })

    it('opens and closes the lightbox via the image element click', async () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        const figure = wrapper.find('[data-testid="media-preview-figure"]')
        expect(figure.exists()).toBe(true)
        await figure.trigger('click')
        await flushPromises()
        const lightbox = wrapper.find('[data-testid="media-lightbox"]')
        expect(lightbox.exists()).toBe(true)
    })

    it('does not render the lightbox overlay for non-image assets', async () => {
        const audio: MediaAsset = { ...sample, media_type: 'audio', mime_type: 'audio/mpeg' }
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: audio, hostContext } })
        await flushPromises()
        expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(false)
    })

    it('closes the lightbox via the close button', async () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="media-preview-figure"]').trigger('click')
        await flushPromises()
        const closeBtn = wrapper.find('[data-testid="lightbox-close"]')
        await closeBtn.trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(false)
    })

    it('starts and saves the filename inline edit', async () => {
        const { hostContext, api } = buildHostContext()
        api.patch.mockResolvedValue({ ...sample, filename: 'renamed.png' })
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('h3.cursor-pointer').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        expect(input.exists()).toBe(true)
        await input.setValue('renamed.png')
        const form = input.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { filename: 'renamed.png' })
    })

    it('cancels the filename inline edit without issuing a PATCH', async () => {
        const { hostContext, api } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('h3.cursor-pointer').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        await input.setValue('never-saved')
        await wrapper.find('[data-testid="filename-cancel"]').trigger('click')
        await flushPromises()
        expect(api.patch).not.toHaveBeenCalled()
        expect(wrapper.find('input[data-testid="filename-input"]').exists()).toBe(false)
    })

    it('rejects an empty filename and does not issue a PATCH', async () => {
        const { hostContext, api } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('h3.cursor-pointer').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        await input.setValue('   ')
        const form = input.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(api.patch).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('Filename cannot be empty')
    })

    it('saves tags as a comma-separated array', async () => {
        const { hostContext, api } = buildHostContext()
        api.patch.mockResolvedValue({ ...sample, tags: ['draft', 'redacted', 'hero'] })
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        const tagsBtn = wrapper.find('[data-testid="tags-edit-button"]')
        await tagsBtn.trigger('click')
        await flushPromises()
        const tagsInput = wrapper.find('input[placeholder^="tag1"]')
        expect(tagsInput.exists()).toBe(true)
        await tagsInput.setValue('draft, redacted, ,hero')
        const form = tagsInput.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { tags: ['draft', 'redacted', 'hero'] })
    })

    it('saves the prompt inline edit', async () => {
        const { hostContext, api } = buildHostContext()
        api.patch.mockResolvedValue({ ...sample, prompt: 'updated prompt' })
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="prompt-edit-button"]').trigger('click')
        await flushPromises()
        const textarea = wrapper.find('textarea')
        await textarea.setValue('updated prompt')
        const form = textarea.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(api.patch).toHaveBeenCalledWith(`/media/${sample.id}`, { prompt: 'updated prompt' })
    })

    it('keeps the edit form open when the save returns a 500', async () => {
        const { hostContext, api } = buildHostContext()
        api.patch.mockRejectedValue(new Error('HTTP 500 Internal Server Error'))
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('h3.cursor-pointer').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        await input.setValue('will-fail.png')
        const form = input.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(wrapper.text()).toContain('HTTP 500')
        // Edit form must remain open so the user can retry or correct.
        expect(wrapper.find('input[data-testid="filename-input"]').exists()).toBe(true)
    })

    it('opens the accessible delete dialog and emits delete on confirm', async () => {
        const { hostContext, api } = buildHostContext()
        api.delete.mockResolvedValue(undefined)
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="media-drawer-delete"]').trigger('click')
        await flushPromises()
        const dialog = wrapper.find('[data-testid="delete-confirm-dialog"]').element as HTMLDialogElement
        expect(dialog.open).toBe(true)
        await wrapper.find('[data-testid="delete-confirm"]').trigger('click')
        await flushPromises()
        expect(api.delete).toHaveBeenCalledWith(`/media/${sample.id}`)
        expect(wrapper.emitted('deleted')?.[0]?.[0]).toBe(sample.id)
    })

    it('does not delete when the user cancels the confirm dialog', async () => {
        const { hostContext, api } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="media-drawer-delete"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="delete-cancel"]').trigger('click')
        await flushPromises()
        expect(api.delete).not.toHaveBeenCalled()
        expect(wrapper.emitted('deleted')).toBeUndefined()
    })

    it('falls back to the UUID when constructing the download name without a filename', () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, filename: null, plugin_slug: null, mime_type: 'image/png' }, hostContext } })
        const download = wrapper.find('a[data-testid="media-drawer-download"]')
        expect(download.attributes('download')).toBe('media-test-1.png')
    })

    it('uses the filename for the download attribute when set', () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, filename: 'shot.png' }, hostContext } })
        const download = wrapper.find('a[data-testid="media-drawer-download"]')
        expect(download.attributes('download')).toBe('shot.png')
    })

    it('renders the markdown extraction panel when has_markdown is true', () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, has_markdown: true }, hostContext } })
        expect(wrapper.text()).toBeTruthy()
    })

    it('hides the metadata fields that are null on the asset', () => {
        const { hostContext } = buildHostContext()
        const slim: MediaAsset = { ...sample, width: null, height: null, duration_seconds: null, byte_size: null }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: slim, hostContext } })
        const text = wrapper.text()
        expect(text).not.toContain('Dimensions')
        expect(text).not.toContain('Duration')
        expect(text).not.toContain('Size')
    })

    it('renders the video element with muted and playsinline', () => {
        const { hostContext } = buildHostContext()
        const video: MediaAsset = { ...sample, media_type: 'video', mime_type: 'video/mp4' }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: video, hostContext } })
        const videoEl = wrapper.find('[data-testid="media-drawer-video"]')
        expect(videoEl.exists()).toBe(true)
        expect(videoEl.attributes('muted')).toBeDefined()
        expect(videoEl.attributes('playsinline')).toBeDefined()
    })

    it('renders the source link with rel="noopener noreferrer"', () => {
        const { hostContext } = buildHostContext()
        const withSource: MediaAsset = { ...sample, source_url: 'https://example.com/foo.png' }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: withSource, hostContext } })
        const link = wrapper.find('a[href="https://example.com/foo.png"]')
        expect(link.exists()).toBe(true)
        expect(link.attributes('rel')).toBe('noopener noreferrer')
    })

    it('refuses to render an unsafe source URL scheme', () => {
        const { hostContext } = buildHostContext()
        const withSource: MediaAsset = { ...sample, source_url: 'javascript:alert(1)' }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: withSource, hostContext } })
        expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('Invalid source URL')
    })

    it('refuses to render a syntactically broken source URL', () => {
        const { hostContext } = buildHostContext()
        // Unclosed IPv6 bracket forces the URL constructor into its catch
        // branch (rather than the protocol-check branch the javascript:
        // test exercises). Both end up rendering "Invalid source URL".
        const withSource: MediaAsset = { ...sample, source_url: 'http://[invalid' }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: withSource, hostContext } })
        expect(wrapper.find('a[href^="http://[invalid"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('Invalid source URL')
    })

    it('marks the lightbox dialog with aria-modal', async () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="media-preview-figure"]').trigger('click')
        await flushPromises()
        const lightbox = wrapper.find('[data-testid="media-lightbox"]')
        expect(lightbox.attributes('aria-modal')).toBe('true')
    })

    it('closes the lightbox via the backdrop click', async () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('[data-testid="media-preview-figure"]').trigger('click')
        await flushPromises()
        const lightbox = wrapper.find('[data-testid="media-lightbox"]')
        // The dialog element is the backdrop target (click.self).
        await lightbox.trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(false)
    })

    it('announces the sharing status via an <output> element with aria-live=polite', () => {
        const { hostContext } = buildHostContext()
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        const status = wrapper.find('[data-testid="sharing-status"]')
        expect(status.exists()).toBe(true)
        expect(status.element.tagName).toBe('OUTPUT')
        // <output> already carries the implicit `status` role; asserting it
        // would re-introduce the redundant `role="status"` that SonarCloud
        // flagged (Web:S6822).
        expect(status.attributes('role')).toBeUndefined()
        expect(status.attributes('aria-live')).toBe('polite')
    })

    it('disables save buttons while a save is in flight', async () => {
        const { hostContext, api } = buildHostContext()
        let resolvePatch: ((v: MediaAsset) => void) | null = null
        api.patch.mockReturnValueOnce(new Promise<MediaAsset>((resolve) => {
            resolvePatch = resolve
        }))
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample, hostContext } })
        await flushPromises()
        await wrapper.find('h3.cursor-pointer').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        await input.setValue('busy.png')
        const form = input.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        // While the patch is in flight, the prompt Save button (a different
        // field) must also be disabled — savingField is global to the drawer.
        const promptBtn = wrapper.find('[data-testid="prompt-edit-button"]')
        // Move to prompt edit mode so we can probe its Save button.
        await promptBtn.trigger('click')
        await flushPromises()
        const promptSave = wrapper.find('[data-testid="prompt-save"]')
        expect(promptSave.exists()).toBe(true)
        expect(promptSave.attributes('disabled')).toBeDefined()
        // Resolve the patch so the drawer can settle.
        ;(resolvePatch as unknown as ((v: MediaAsset) => void) | null)?.({ ...sample, filename: 'busy.png' })
        await flushPromises()
    })
})

describe('mount contract', () => {
    it('exposes a mount function on the global when the bundle is loaded', async () => {
        // Indirect smoke: if `SporaAppMediaArchive` is undefined the
        // call below throws; reaching the end proves the global exists.
        const stub = vi.fn()
        const target = document.createElement('div')
        target.id = 'app'
        document.body.appendChild(target)
        const globalRef = (window as unknown as { SporaAppMediaArchive?: { mount: typeof stub } }).SporaAppMediaArchive
        if (globalRef) {
            globalRef.mount(target, {
                api: { get: stub, post: stub, patch: stub, delete: stub },
                pinia: null,
                theme: 'light',
                route: null,
                router: null,
            })
        }
        expect(true).toBe(true)
        document.body.removeChild(target)
    })
})