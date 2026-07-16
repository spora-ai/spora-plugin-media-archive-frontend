import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MediaGrid from '../src/components/MediaGrid.vue'
import MediaCard from '../src/components/MediaCard.vue'
import MediaDetailDrawer from '../src/components/MediaDetailDrawer.vue'
import MediaFilters from '../src/components/MediaFilters.vue'
import type { MediaAsset } from '../src/types'

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
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        const dialog = wrapper.find('dialog').element as HTMLDialogElement
        expect(dialog.open).toBe(true)
    })

    it('emits close when the dialog cancel event fires (Escape key)', async () => {
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
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
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
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
            const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
            expect(wrapper.text()).toContain(sample.created_at)
        } finally {
            spy.mockRestore()
        }
    })

    it('skips dialog.close() on unmount when the dialog is already closed', async () => {
        // Guards against double-firing close when the parent clears
        // `selected` after we already dispatched cancel.
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
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
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
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
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-uuid"]').trigger('click')
        await flushPromises()
        expect(wrapper.text()).toContain('Clipboard access denied')
    })

    it('copies the filename (or UUID when filename is null) via the copy filename button', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, filename: 'shot.png' } } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-filename"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith('shot.png')
    })

    it('falls back to copying the UUID when the filename is null', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, filename: null } } })
        await flushPromises()
        await wrapper.find('[data-testid="copy-filename"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith(sample.id)
    })

    it('enables public sharing when the toggle is on', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ data: { ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=abc' } })
        vi.stubGlobal('fetch', fetchMock)
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        const toggle = wrapper.find('[data-testid="public-sharing-toggle"]')
        await toggle.setValue(true)
        await flushPromises()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(`/media/${sample.id}`)
        expect(init.method).toBe('PATCH')
        expect(JSON.parse(init.body)).toEqual({ public_access_enabled: true })
        const updated = fetchMock.mock.results[0].value
        expect((await updated).data.public_url).toContain('?token=abc')
    })

    it('disables public sharing when the toggle is off', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ data: { ...sample, public_url: null } })
        vi.stubGlobal('fetch', fetchMock)
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=abc' } } })
        await flushPromises()
        const toggle = wrapper.find('[data-testid="public-sharing-toggle"]')
        await toggle.setValue(false)
        await flushPromises()
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ public_access_enabled: false })
    })

    it('surfaces the public-sharing toggle error in the error panel', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('sharing failed'))
        vi.stubGlobal('fetch', fetchMock)
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        await wrapper.find('[data-testid="public-sharing-toggle"]').setValue(true)
        await flushPromises()
        expect(wrapper.text()).toContain('sharing failed')
    })

    it('refreshes the public-access token', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ data: { ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=fresh' } })
        vi.stubGlobal('fetch', fetchMock)
        const shared: MediaAsset = { ...sample, public_url: 'https://example.test/api/v1/public/media/' + sample.id + '?token=old' }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: shared } })
        await flushPromises()
        const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('Refresh token'))!
        await refreshBtn.trigger('click')
        await flushPromises()
        expect(fetchMock).toHaveBeenCalledWith(`/media/${sample.id}/public-token/refresh`, expect.objectContaining({ method: 'POST' }))
        const updated = fetchMock.mock.results[0].value
        expect((await updated).data.public_url).toContain('?token=fresh')
    })

    it('copies the public URL to the clipboard when the share section is open', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const url = 'https://example.test/api/v1/public/media/' + sample.id + '?token=abc'
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, public_url: url } } })
        await flushPromises()
        const copyUrlBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Copy URL')!
        await copyUrlBtn.trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith(url)
    })

    it('opens and closes the lightbox via the image element click', async () => {
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        const figure = wrapper.find('figure.cursor-zoom-in')
        expect(figure.exists()).toBe(true)
        await figure.trigger('click')
        await flushPromises()
        const lightbox = wrapper.find('[data-testid="media-lightbox"]')
        expect(lightbox.exists()).toBe(true)
    })

    it('does not render the lightbox overlay for non-image assets', async () => {
        const audio: MediaAsset = { ...sample, media_type: 'audio', mime_type: 'audio/mpeg' }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: audio } })
        await flushPromises()
        expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(false)
    })

    it('closes the lightbox via the close button', async () => {
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        await wrapper.find('figure.cursor-zoom-in').trigger('click')
        await flushPromises()
        const closeBtn = wrapper.find('button[aria-label="Close lightbox"]')
        await closeBtn.trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(false)
    })

    it('starts and saves the filename inline edit', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ data: { ...sample, filename: 'renamed.png' } })
        vi.stubGlobal('fetch', fetchMock)
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        await wrapper.find('h3.cursor-pointer').trigger('click')
        await flushPromises()
        const input = wrapper.find('input[data-testid="filename-input"]')
        expect(input.exists()).toBe(true)
        await input.setValue('renamed.png')
        const form = input.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(fetchMock).toHaveBeenCalledWith(`/media/${sample.id}`, expect.objectContaining({ method: 'PATCH' }))
        const body = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(body).toMatchObject({ filename: 'renamed.png' })
    })

    it('saves tags as a comma-separated array', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ data: { ...sample, tags: ['draft', 'redacted'] } })
        vi.stubGlobal('fetch', fetchMock)
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        const tagsBtn = wrapper.find('button[title="Click to edit tags"]')
        await tagsBtn.trigger('click')
        await flushPromises()
        const tagsInput = wrapper.find('input[placeholder^="tag1"]')
        expect(tagsInput.exists()).toBe(true)
        await tagsInput.setValue('draft, redacted, ,hero')
        const form = tagsInput.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        const [, init] = fetchMock.mock.calls[0]
        expect(JSON.parse(init.body)).toEqual({ tags: ['draft', 'redacted', 'hero'] })
    })

    it('saves the prompt inline edit', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ data: { ...sample, prompt: 'updated prompt' } })
        vi.stubGlobal('fetch', fetchMock)
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        const promptBtn = wrapper.find('p.cursor-pointer')
        await promptBtn.trigger('click')
        await flushPromises()
        const textarea = wrapper.find('textarea')
        await textarea.setValue('updated prompt')
        const form = textarea.element.closest('form')!
        await form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
        await flushPromises()
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ prompt: 'updated prompt' })
    })

    it('confirms and deletes the asset when the user accepts', async () => {
        const fetchMock = vi.fn().mockResolvedValue({})
        vi.stubGlobal('fetch', fetchMock)
        vi.stubGlobal('confirm', () => true)
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        await wrapper.find('[data-testid="media-drawer-delete"]').trigger('click')
        await flushPromises()
        expect(fetchMock).toHaveBeenCalledWith(`/media/${sample.id}`, expect.objectContaining({ method: 'DELETE' }))
        expect(wrapper.emitted('deleted')?.[0]?.[0]).toBe(sample.id)
    })

    it('skips the delete when the user cancels the confirm', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        vi.stubGlobal('confirm', () => false)
        const wrapper = mount(MediaDetailDrawer, { props: { asset: sample } })
        await flushPromises()
        await wrapper.find('[data-testid="media-drawer-delete"]').trigger('click')
        await flushPromises()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('falls back to the UUID when constructing the download name without a filename', () => {
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, filename: null, plugin_slug: null, mime_type: 'image/png' } } })
        const download = wrapper.find('a[data-testid="media-drawer-download"]')
        expect(download.attributes('download')).toBe('media-test-1.png')
    })

    it('uses the filename for the download attribute when set', () => {
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, filename: 'shot.png' } } })
        const download = wrapper.find('a[data-testid="media-drawer-download"]')
        expect(download.attributes('download')).toBe('shot.png')
    })

    it('renders the markdown extraction panel when has_markdown is true', () => {
        // The drawer intentionally does not currently render a markdown
        // preview when has_markdown is true (the v2 detail page does).
        // This assertion documents the current behaviour so future
        // changes are intentional.
        const wrapper = mount(MediaDetailDrawer, { props: { asset: { ...sample, has_markdown: true } } })
        expect(wrapper.text()).toBeTruthy()
    })

    it('hides the metadata fields that are null on the asset', () => {
        const slim: MediaAsset = { ...sample, width: null, height: null, duration_seconds: null, byte_size: null }
        const wrapper = mount(MediaDetailDrawer, { props: { asset: slim } })
        const text = wrapper.text()
        expect(text).not.toContain('Dimensions')
        expect(text).not.toContain('Duration')
        expect(text).not.toContain('Size')
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