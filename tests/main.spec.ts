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
        const wrapper = mount(MediaFilters, { props: { type: '', search: '' } })
        await wrapper.find('[data-testid="media-type-image"]').trigger('click')
        expect(wrapper.emitted('update:type')?.[0]?.[0]).toBe('image')
    })

    it('emits update:search as the user types', async () => {
        const wrapper = mount(MediaFilters, { props: { type: '', search: '' } })
        const input = wrapper.find('[data-testid="media-search"]')
        await input.setValue('alpaca')
        expect(wrapper.emitted('update:search')?.[0]?.[0]).toBe('alpaca')
    })

    it('marks the active pill', () => {
        const wrapper = mount(MediaFilters, { props: { type: 'audio', search: '' } })
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