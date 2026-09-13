import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaCard from '../../src/components/MediaCard.vue'
import type { MediaAsset } from '../../src/types'
import {
    __resetShowTemporaryToggleForTesting,
    useShowTemporaryToggle,
} from '../../src/composables/useShowTemporaryToggle'

/**
 * Fixtures shared across the badge-on / badge-off cases. Only the
 * `is_temporary` flag differs per test; the rest of the wire shape
 * mirrors the existing `App.spec.ts` baseline.
 */
function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
    return {
        id: 'asset-1',
        media_type: 'image',
        mime_type: 'image/png',
        byte_size: 4096,
        width: 64,
        height: 64,
        duration_seconds: null,
        prompt: 'a tiny pixel',
        filename: 'pixel.png',
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
        ...overrides,
    }
}

describe('MediaCard.vue Temporary badge', () => {
    beforeEach(() => {
        // The toggle is a module-level singleton; reset before each
        // test so the persisted default (off) doesn't carry over from
        // a sibling spec that flipped it.
        __resetShowTemporaryToggleForTesting()
    })
    afterEach(() => {
        __resetShowTemporaryToggleForTesting()
    })

    it('does not render the Temporary badge when the asset is not temporary', () => {
        // Default fixture has is_temporary undefined; the badge must
        // never render regardless of the toggle state because the
        // server already filters these out of the list payload.
        const wrapper = mount(MediaCard, {
            props: { asset: makeAsset({ is_temporary: false }) },
        })
        expect(wrapper.find('[data-testid="media-card-temporary-badge"]').exists()).toBe(false)
    })

    it('renders the Temporary badge when is_temporary is true and the toggle is on', () => {
        // Flip the toggle before mount; the card reads the same
        // singleton ref so the change propagates on first render.
        const { showTemporary } = useShowTemporaryToggle()
        expect(showTemporary.value).toBe(false)
        showTemporary.value = true
        const wrapper = mount(MediaCard, {
            props: { asset: makeAsset({ is_temporary: true }) },
        })
        const badge = wrapper.find('[data-testid="media-card-temporary-badge"]')
        expect(badge.exists()).toBe(true)
        expect(badge.text()).toBe('Temporary')
    })

    it('hides the Temporary badge when the toggle is off even if the asset is temporary', () => {
        // Defence-in-depth: the server filters temp rows out when
        // include_temporary=false, but a stale client cache could
        // keep one around. The card's `&&` must still hide it.
        const wrapper = mount(MediaCard, {
            props: { asset: makeAsset({ is_temporary: true }) },
        })
        expect(wrapper.find('[data-testid="media-card-temporary-badge"]').exists()).toBe(false)
    })

    it('renders filename and size chip independently of the badge', () => {
        // Regression guard: the badge sits inside the thumbnail
        // wrapper alongside the <img>, and adding a sibling must
        // not push the existing filename/size line out of place.
        const wrapper = mount(MediaCard, {
            props: { asset: makeAsset({ is_temporary: true }) },
        })
        expect(wrapper.find('[data-testid="media-card-filename"]').text()).toContain('pixel.png')
        expect(wrapper.find('[data-testid="media-card-temporary-badge"]').exists()).toBe(false)
    })
})