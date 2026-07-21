import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaGrid from '../src/components/MediaGrid.vue'
import MediaCard from '../src/components/MediaCard.vue'
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
    it('renders the filename when present, falling back to the id', () => {
        const named: MediaAsset = { ...sample, filename: 'shot.png' }
        const namedWrapper = mount(MediaCard, { props: { asset: named } })
        expect(namedWrapper.find('[data-testid="media-card-filename"]').text()).toContain('shot.png')

        const unnamedWrapper = mount(MediaCard, { props: { asset: sample } })
        expect(unnamedWrapper.find('[data-testid="media-card-filename"]').text()).toContain(sample.id)
    })

    it('renders the plugin slug and tool name as a secondary line', () => {
        const wrapper = mount(MediaCard, { props: { asset: sample } })
        expect(wrapper.text()).toContain('minimax')
        expect(wrapper.text()).toContain('image')
    })

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

    it('falls back to the video icon for video media', () => {
        const videoAsset: MediaAsset = { ...sample, media_type: 'video', mime_type: 'video/mp4', width: null, height: null }
        const wrapper = mount(MediaCard, { props: { asset: videoAsset } })
        expect(wrapper.find('img').exists()).toBe(false)
    })

    it('falls back to the generic file icon for document media', () => {
        const docAsset: MediaAsset = { ...sample, media_type: 'document', mime_type: 'text/plain', width: null, height: null }
        const wrapper = mount(MediaCard, { props: { asset: docAsset } })
        expect(wrapper.find('img').exists()).toBe(false)
    })

    it('formats byte_size under 1 KiB in bytes', () => {
        const tiny: MediaAsset = { ...sample, byte_size: 256 }
        const wrapper = mount(MediaCard, { props: { asset: tiny } })
        expect(wrapper.text()).toContain('256 B')
    })

    it('omits the size badge when byte_size is null', () => {
        const nullSize: MediaAsset = { ...sample, byte_size: null }
        const wrapper = mount(MediaCard, { props: { asset: nullSize } })
        expect(wrapper.text()).not.toContain('KB')
        expect(wrapper.text()).not.toContain('MB')
    })

    it('renders the tool_name when both plugin_slug and tool_name are set', () => {
        const wrapper = mount(MediaCard, { props: { asset: sample } })
        expect(wrapper.text()).toContain('minimax · image')
    })

    it('renders the plugin_slug without tool_name when tool_name is null', () => {
        const noTool: MediaAsset = { ...sample, tool_name: null }
        const wrapper = mount(MediaCard, { props: { asset: noTool } })
        expect(wrapper.text()).toContain('minimax')
        expect(wrapper.text()).not.toContain('·')
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