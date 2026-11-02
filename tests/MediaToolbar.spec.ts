import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaToolbar from '../src/components/MediaToolbar.vue'
import type { MediaPrincipal } from '../src/types'
import {
    __resetShowTemporaryToggleForTesting,
    useShowTemporaryToggle,
} from '../src/composables/useShowTemporaryToggle'

const userPrincipal: MediaPrincipal = { id: 101, type: 'user', user_id: 1, group_id: null }
const marketingPrincipal: MediaPrincipal = { id: 202, type: 'group', user_id: null, group_id: 10 }

function mountToolbar(props: {
    type?: 'image' | 'audio' | 'video' | 'document' | 'unknown' | ''
    search?: string
    kind?: 'asset' | 'template' | 'example' | ''
    foldersSupported?: boolean
    showRail?: boolean
    principals?: MediaPrincipal[]
    selectedScope?: number | null
    groupLabels?: Record<number, string>
    myMediaLabel?: string | null
} = {}) {
    return mount(MediaToolbar, {
        props: {
            type: props.type ?? '',
            search: props.search ?? '',
            kind: props.kind ?? '',
            foldersSupported: props.foldersSupported ?? true,
            showRail: props.showRail ?? true,
            principals: props.principals ?? [userPrincipal, marketingPrincipal],
            selectedScope: props.selectedScope ?? null,
            groupLabels: props.groupLabels ?? { 202: 'Marketing Team' },
            myMediaLabel: props.myMediaLabel ?? null,
        },
    })
}

describe('MediaToolbar.vue search box', () => {
    it('renders the search input with the current search term as its value', () => {
        const wrapper = mountToolbar({ search: 'alpine' })
        const input = wrapper.find<HTMLInputElement>('[data-testid="media-search"]')
        expect(input.exists()).toBe(true)
        expect(input.element.value).toBe('alpine')
    })

    it('emits the typed value on every keystroke, without debouncing it', async () => {
        const wrapper = mountToolbar()
        await wrapper.find('[data-testid="media-search"]').setValue('alpaca')
        // No timer is advanced: a debounced control would have emitted
        // nothing yet.
        expect(wrapper.emitted('update:search')?.[0]).toEqual(['alpaca'])

        await wrapper.find('[data-testid="media-search"]').setValue('alpacas')
        expect(wrapper.emitted('update:search')?.[1]).toEqual(['alpacas'])
    })
})

describe('MediaToolbar.vue type dropdown', () => {
    it('opens a menu on the toggle', async () => {
        const wrapper = mountToolbar()
        expect(wrapper.find('[data-testid="media-type-select-menu"]').exists()).toBe(false)

        await wrapper.find('[data-testid="media-type-select-toggle"]').trigger('click')
        const menu = wrapper.find('[data-testid="media-type-select-menu"]')
        expect(menu.exists()).toBe(true)
        expect(menu.attributes('role')).toBe('menu')
    })

    it('offers every media type plus the unfiltered state', async () => {
        const wrapper = mountToolbar()
        await wrapper.find('[data-testid="media-type-select-toggle"]').trigger('click')
        for (const option of ['all', 'image', 'audio', 'video', 'document']) {
            expect(wrapper.find(`[data-testid="media-type-select-option-${option}"]`).exists()).toBe(true)
        }
    })

    it('emits the picked type', async () => {
        const wrapper = mountToolbar()
        await wrapper.find('[data-testid="media-type-select-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-type-select-option-image"]').trigger('click')
        expect(wrapper.emitted('update:type')?.[0]).toEqual(['image'])
    })

    it('emits the empty value for the unfiltered state', async () => {
        const wrapper = mountToolbar({ type: 'image' })
        await wrapper.find('[data-testid="media-type-select-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-type-select-option-all"]').trigger('click')
        expect(wrapper.emitted('update:type')?.[0]).toEqual([''])
    })

    it('names the chosen type on the trigger', () => {
        const wrapper = mountToolbar({ type: 'audio' })
        expect(wrapper.find('[data-testid="media-type-select-toggle"]').text()).toContain('Audio')
    })

    it('closes the menu on the choice', async () => {
        // The pick is the answer: a menu that stays open over the grid
        // it just changed hides the result.
        const wrapper = mountToolbar()
        await wrapper.find('[data-testid="media-type-select-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-type-select-menu"]').exists()).toBe(true)
        await wrapper.find('[data-testid="media-type-select-option-image"]').trigger('click')
        expect(wrapper.find('[data-testid="media-type-select-menu"]').exists()).toBe(false)
    })
})

describe('MediaToolbar.vue kind dropdown', () => {
    it('offers the three marks plus the unfiltered state', async () => {
        const wrapper = mountToolbar()
        await wrapper.find('[data-testid="media-kind-select-toggle"]').trigger('click')
        for (const option of ['all', 'asset', 'template', 'example']) {
            expect(wrapper.find(`[data-testid="media-kind-select-option-${option}"]`).exists()).toBe(true)
        }
    })

    it('emits the picked mark', async () => {
        const wrapper = mountToolbar()
        await wrapper.find('[data-testid="media-kind-select-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-kind-select-option-template"]').trigger('click')
        expect(wrapper.emitted('update:kind')?.[0]).toEqual(['template'])
    })

    it('is absent when the core has no folders endpoint', () => {
        // A core predating the folders release ignores `?kind=`, and a
        // filter the server ignores is worse than no filter.
        const wrapper = mountToolbar({ foldersSupported: false })
        expect(wrapper.find('[data-testid="media-kind-select-toggle"]').exists()).toBe(false)
    })
})

describe('MediaToolbar.vue upload button', () => {
    it('emits upload-click when pressed', async () => {
        const wrapper = mountToolbar()
        await wrapper.find('[data-testid="media-archive-upload-button"]').trigger('click')
        expect(wrapper.emitted('upload-click')).toHaveLength(1)
    })

    it('is disabled when no principal is visible', () => {
        const wrapper = mountToolbar({ principals: [] })
        const button = wrapper.find('[data-testid="media-archive-upload-button"]')
        expect(button.exists()).toBe(true)
        expect(button.attributes('disabled')).toBeDefined()
    })

    it('is enabled when a principal is visible', () => {
        const wrapper = mountToolbar()
        expect(wrapper.find('[data-testid="media-archive-upload-button"]').attributes('disabled')).toBeUndefined()
    })
})

describe('MediaToolbar.vue folder rail button', () => {
    it('emits open-folders when the rail button is pressed', async () => {
        const wrapper = mountToolbar({ showRail: true })
        const button = wrapper.find('[data-testid="media-rail-open"]')
        expect(button.exists()).toBe(true)
        await button.trigger('click')
        expect(wrapper.emitted('open-folders')).toHaveLength(1)
    })

    it('is absent when the rail is already on screen', () => {
        // The rail is a column on a wide screen; the button that opens it
        // as a drawer has no business there.
        const wrapper = mountToolbar({ showRail: false })
        expect(wrapper.find('[data-testid="media-rail-open"]').exists()).toBe(false)
    })
})

describe('MediaToolbar.vue scope', () => {
    it('carries the scope control and emits the picked principal', async () => {
        const wrapper = mountToolbar()
        const toggle = wrapper.find('[data-testid="media-scope-toggle"]')
        expect(toggle.exists()).toBe(true)
        await toggle.trigger('click')
        await wrapper.find('[data-testid="media-scope-option-202"]').trigger('click')
        expect(wrapper.emitted('update:scope')?.[0]).toEqual([202])
    })
})

describe('MediaToolbar.vue "Include temporary files" toggle', () => {
    beforeEach(() => {
        __resetShowTemporaryToggleForTesting()
    })
    afterEach(() => {
        __resetShowTemporaryToggleForTesting()
    })

    it('renders the toggle and defaults to off', () => {
        const wrapper = mountToolbar()
        const toggle = wrapper.find<HTMLInputElement>('[data-testid="media-show-temporary"]')
        expect(toggle.exists()).toBe(true)
        expect(toggle.element.checked).toBe(false)
        expect(useShowTemporaryToggle().showTemporary.value).toBe(false)
    })

    it('flips the shared singleton on change and persists it', async () => {
        const wrapper = mountToolbar()
        await wrapper.find<HTMLInputElement>('[data-testid="media-show-temporary"]').setValue(true)
        expect(useShowTemporaryToggle().showTemporary.value).toBe(true)
        expect(localStorage.getItem('spora.media.showTemporary.v1')).toBe('true')
    })

    it('reflects the singleton when it is already on', () => {
        useShowTemporaryToggle().setShowTemporary(true)
        const wrapper = mountToolbar()
        const toggle = wrapper.find<HTMLInputElement>('[data-testid="media-show-temporary"]')
        expect(toggle.element.checked).toBe(true)
    })
})
