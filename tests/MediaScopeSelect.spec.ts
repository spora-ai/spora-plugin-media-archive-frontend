import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import MediaScopeSelect from '../src/components/MediaScopeSelect.vue'
import type { MediaPrincipal } from '../src/types'

/**
 * Fixtures mirror what `GET /principals/me` returns: each principal
 * carries a `type: 'user' | 'group'` discriminator that the dropdown uses
 * to label the row (user → "My Media", group → `groupLabels[id]` with a
 * `Group #N` fallback).
 */
const userPrincipal: MediaPrincipal = { id: 101, type: 'user', user_id: 1, group_id: null }
const marketingPrincipal: MediaPrincipal = { id: 202, type: 'group', user_id: null, group_id: 10 }
const otherPrincipal: MediaPrincipal = { id: 999, type: 'group', user_id: null, group_id: 20 }

/**
 * The wrappers are attached to the document, so the dropdown's
 * click-outside and Escape handling — which are document-level listeners —
 * are reachable from a test. Every wrapper is unmounted afterwards so a
 * stale menu cannot close the next test's menu.
 */
const mounted: VueWrapper[] = []

function mountSelect(props: {
    principals?: MediaPrincipal[]
    selectedScope?: number | null
    groupLabels?: Record<number, string>
    myMediaLabel?: string | null
    compact?: boolean
} = {}): VueWrapper {
    const wrapper = mount(MediaScopeSelect, {
        props: {
            principals: props.principals ?? [userPrincipal, marketingPrincipal],
            selectedScope: props.selectedScope ?? null,
            groupLabels: props.groupLabels ?? { 202: 'Marketing Team' },
            myMediaLabel: props.myMediaLabel ?? null,
            compact: props.compact ?? false,
        },
        attachTo: document.body,
    })
    mounted.push(wrapper)
    return wrapper
}

afterEach(() => {
    while (mounted.length > 0) {
        mounted.pop()?.unmount()
    }
    document.body.innerHTML = ''
})

describe('MediaScopeSelect.vue menu', () => {
    it('keeps the menu closed until the toggle is clicked', () => {
        const wrapper = mountSelect()
        expect(wrapper.find('[data-testid="media-scope-menu"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-scope-toggle"]').attributes('aria-expanded')).toBe('false')
    })

    it('opens the menu on the toggle and closes it again on a second click', async () => {
        const wrapper = mountSelect()
        const toggle = wrapper.find('[data-testid="media-scope-toggle"]')
        await toggle.trigger('click')
        const menu = wrapper.find('[data-testid="media-scope-menu"]')
        expect(menu.exists()).toBe(true)
        expect(menu.attributes('role')).toBe('listbox')
        expect(toggle.attributes('aria-expanded')).toBe('true')

        await toggle.trigger('click')
        expect(wrapper.find('[data-testid="media-scope-menu"]').exists()).toBe(false)
    })

    it('lists the ALL row and one row per principal', async () => {
        const wrapper = mountSelect()
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-scope-option-all"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-option-101"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-option-202"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-option-999"]').exists()).toBe(false)
    })

    it('emits the picked principal id', async () => {
        const wrapper = mountSelect()
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-scope-option-202"]').trigger('click')
        expect(wrapper.emitted('update:scope')?.[0]).toEqual([202])
    })

    it('emits null when the ALL row is picked', async () => {
        const wrapper = mountSelect({ selectedScope: 202 })
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-scope-option-all"]').trigger('click')
        expect(wrapper.emitted('update:scope')?.[0]).toEqual([null])
    })

    it('closes on a click outside the control', async () => {
        const wrapper = mountSelect()
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-scope-menu"]').exists()).toBe(true)

        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-testid="media-scope-menu"]').exists()).toBe(false)
    })

    it('closes on Escape', async () => {
        const wrapper = mountSelect()
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-scope-menu"]').exists()).toBe(true)

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-testid="media-scope-menu"]').exists()).toBe(false)
    })
})

describe('MediaScopeSelect.vue labels', () => {
    it('names the user-principal "My Media" and the group-principal by its group name', async () => {
        const wrapper = mountSelect()
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        const own = wrapper.find('[data-testid="media-scope-option-101"]')
        const other = wrapper.find('[data-testid="media-scope-option-202"]')
        expect(own.text()).toContain('My Media')
        expect(own.text()).not.toContain('Group #101')
        expect(other.text()).toContain('Marketing Team')
    })

    it('falls back to "Group #N" when no group label is provided', async () => {
        const wrapper = mountSelect({
            principals: [userPrincipal, otherPrincipal],
            groupLabels: {},
        })
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-scope-option-999"]').text()).toContain('Group #999')
    })

    it('suffixes the user-principal with myMediaLabel when provided', async () => {
        const wrapper = mountSelect({
            principals: [userPrincipal],
            groupLabels: {},
            myMediaLabel: 'Operator',
        })
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-scope-option-101"]').text()).toContain('My Media (Operator)')
    })

    it('names the selected principal on the trigger and "All principals" when none is selected', () => {
        const all = mountSelect()
        expect(all.find('[data-testid="media-scope-toggle"]').text()).toContain('All principals')

        const scoped = mountSelect({ selectedScope: 202 })
        expect(scoped.find('[data-testid="media-scope-toggle"]').text()).toContain('Marketing Team')
    })

    it('marks the selected row as the chosen option', async () => {
        const wrapper = mountSelect({ selectedScope: 202 })
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-scope-option-202"]').attributes('aria-selected')).toBe('true')
        expect(wrapper.find('[data-testid="media-scope-option-101"]').attributes('aria-selected')).toBe('false')
        expect(wrapper.find('[data-testid="media-scope-option-all"]').attributes('aria-selected')).toBe('false')
    })

    it('marks the ALL row as the chosen option when no principal is selected', async () => {
        const wrapper = mountSelect({ selectedScope: null })
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-scope-option-all"]').attributes('aria-selected')).toBe('true')
    })

    it('renders the compact copy on one line', async () => {
        const wrapper = mountSelect({ compact: true })
        const toggle = wrapper.find('[data-testid="media-scope-toggle"]')
        // The compact copy carries no sub-label — the scope name only.
        expect(toggle.text()).toContain('All principals')
        expect(toggle.text()).not.toContain('Everything you can see')
    })
})
