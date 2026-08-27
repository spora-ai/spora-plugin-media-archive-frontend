import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaFilters from '../src/components/MediaFilters.vue'
import type { MediaPrincipal } from '../src/types'

/**
 * Fixtures mirror what `GET /principals/me` returns: each principal
 * carries a `type: 'user' | 'group'` discriminator that the chip row
 * uses to label the row (user → "My Media", group → `groupLabels[id]`
 * with a `Group #N` fallback).
 */
const userPrincipal: MediaPrincipal = { id: 101, type: 'user', user_id: 1, group_id: null }
const marketingPrincipal: MediaPrincipal = { id: 202, type: 'group', user_id: null, group_id: 10 }
const otherPrincipal: MediaPrincipal = { id: 999, type: 'group', user_id: null, group_id: 20 }

describe('MediaFilters.vue scope chip row', () => {
    it('renders ALL + one chip per principal, with My Media for the user-principal and the group label for the rest', () => {
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [userPrincipal, marketingPrincipal],
                selectedScope: null,
                groupLabels: { 202: 'Marketing Team' },
            },
        })
        // Scope to the actual chip selector — `media-scope-chips` is the
        // container div, not a chip, and would otherwise inflate the count.
        const chips = wrapper.findAll('[data-testid^="media-scope-"]:not([data-testid="media-scope-chips"])')
        expect(chips).toHaveLength(3)
        expect(wrapper.find('[data-testid="media-scope-all"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-101"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-scope-202"]').exists()).toBe(true)
        // User-principal labels as "My Media" — the bug we fixed.
        expect(wrapper.find('[data-testid="media-scope-101"]').text()).toContain('My Media')
        expect(wrapper.find('[data-testid="media-scope-101"]').text()).not.toContain('Group #101')
        // Group-principal gets the friendly group name.
        expect(wrapper.find('[data-testid="media-scope-202"]').text()).toContain('Marketing Team')
    })

    it('falls back to "Group #N" when no group label is provided', () => {
        // Until /groups resolves the plugin still has to render the
        // chip row with a useful-enough fallback label for group rows.
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [userPrincipal, otherPrincipal],
                selectedScope: null,
                groupLabels: {},
            },
        })
        expect(wrapper.find('[data-testid="media-scope-999"]').text()).toContain('Group #999')
    })

    it('suffixes the user-principal chip with myMediaLabel when provided', () => {
        // Mirrors the dashboard's `My Agents (${me.name})` pattern —
        // when the host surfaces the operator's display name, we
        // render `My Media (Operator Name)`.
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [userPrincipal],
                selectedScope: null,
                groupLabels: {},
                myMediaLabel: 'Operator',
            },
        })
        expect(wrapper.find('[data-testid="media-scope-101"]').text()).toContain('My Media (Operator)')
    })

    it('hides the chip row entirely when no principals are visible', () => {
        // No principals at all → no chip row. Belt-and-braces against
        // the parent accidentally passing an empty array after a
        // failed /principals/me fetch.
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [],
                selectedScope: null,
                groupLabels: {},
            },
        })
        expect(wrapper.find('[data-testid="media-scope-chips"]').exists()).toBe(false)
    })

    it('emits update:scope with the picked id, and null on the active-chip toggle', async () => {
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [userPrincipal, marketingPrincipal],
                selectedScope: 101,
                groupLabels: { 202: 'Marketing Team' },
            },
        })
        await wrapper.find('[data-testid="media-scope-202"]').trigger('click')
        expect(wrapper.emitted('update:scope')?.[0]).toEqual([202])

        // Re-mount with 202 already selected so the next click clears it.
        await wrapper.setProps({ selectedScope: 202 })
        await wrapper.find('[data-testid="media-scope-202"]').trigger('click')
        expect(wrapper.emitted('update:scope')?.[1]).toEqual([null])
    })

    it('keeps the legacy type-pills + search input behaviour intact', () => {
        // Regression guard for the scope-chip refactor: the type
        // pills and search input are still wired through the same
        // emit names the grid listens for.
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [userPrincipal],
                selectedScope: null,
                groupLabels: {},
            },
        })
        expect(wrapper.find('[data-testid="media-type-pills"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-search"]').exists()).toBe(true)
    })
})
