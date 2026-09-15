import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaFilters from '../src/components/MediaFilters.vue'
import type { MediaPrincipal } from '../src/types'
import { __resetShowTemporaryToggleForTesting, useShowTemporaryToggle } from '../src/composables/useShowTemporaryToggle'

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

describe('MediaFilters.vue "Include temporary files" toggle', () => {
    beforeEach(() => {
        // Reset the singleton ref + localStorage so each test starts
        // from the documented default (off) regardless of order.
        __resetShowTemporaryToggleForTesting()
    })
    afterEach(() => {
        __resetShowTemporaryToggleForTesting()
    })

    it('renders the toggle and defaults to off', () => {
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [],
                selectedScope: null,
                groupLabels: {},
            },
        })
        const toggleEl = wrapper.find<HTMLInputElement>('[data-testid="media-show-temporary"]')
        expect(toggleEl.exists()).toBe(true)
        expect(toggleEl.element.checked).toBe(false)
        // Shared singleton confirms the default.
        const { showTemporary } = useShowTemporaryToggle()
        expect(showTemporary.value).toBe(false)
    })

    it('flips the singleton ref and persists the change to localStorage on click', async () => {
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [],
                selectedScope: null,
                groupLabels: {},
            },
        })
        const toggleEl = wrapper.find<HTMLInputElement>('[data-testid="media-show-temporary"]')
        await toggleEl.setValue(true)
        const { showTemporary } = useShowTemporaryToggle()
        expect(showTemporary.value).toBe(true)
        // The composable persists under the documented v1 key so
        // operators keep their setting across page reloads.
        expect(localStorage.getItem('spora.media.showTemporary.v1')).toBe('true')
    })

    it('hydrates the singleton from localStorage on a fresh module load', async () => {
        // Simulate a previous session having flipped the toggle on.
        localStorage.setItem('spora.media.showTemporary.v1', 'true')
        // The composable reads localStorage exactly once at module
        // load. Force Vitest to re-evaluate the module so the new
        // value is picked up — this is what happens on a hard browser
        // reload.
        vi.resetModules()
        const fresh = await import('../src/composables/useShowTemporaryToggle')
        const { showTemporary } = fresh.useShowTemporaryToggle()
        expect(showTemporary.value).toBe(true)
    })

    it('persists across a remount that simulates a page reload', async () => {
        // Flip the toggle on, unmount, mount a fresh component — the
        // singleton ref (and its localStorage write) carry over so
        // the new mount sees the same state.
        const first = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [],
                selectedScope: null,
                groupLabels: {},
            },
        })
        await first.find<HTMLInputElement>('[data-testid="media-show-temporary"]').setValue(true)
        first.unmount()

        const second = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [],
                selectedScope: null,
                groupLabels: {},
            },
        })
        const secondToggle = second.find<HTMLInputElement>('[data-testid="media-show-temporary"]')
        expect(secondToggle.element.checked).toBe(true)
    })

    it('falls back to the documented default when localStorage is unavailable', async () => {
        // SSR / private-mode browsers throw on localStorage access.
        // The composable wraps every read/write in try/catch and
        // guards `typeof localStorage === 'undefined'` for the SSR
        // case. Stub the global to undefined and reload the module
        // to exercise those defensive branches.
        vi.stubGlobal('localStorage', undefined)
        vi.resetModules()
        const fresh = await import('../src/composables/useShowTemporaryToggle')
        const { showTemporary, toggle } = fresh.useShowTemporaryToggle()
        expect(showTemporary.value).toBe(false)
        // Toggle should still work — the in-memory ref is the source
        // of truth, persistence is a best-effort optimisation.
        toggle()
        expect(showTemporary.value).toBe(true)
        vi.unstubAllGlobals()
    })

    it('tolerates a localStorage that throws on every read/write call', async () => {
        // Safari private mode + some hardened enterprise browsers
        // expose `localStorage` but throw on every method call. The
        // composable must swallow the throws and keep the in-memory
        // ref working — losing persistence is acceptable, losing the
        // UI is not.
        const throwingStorage = {
            getItem: vi.fn(() => { throw new Error('SecurityError') }),
            setItem: vi.fn(() => { throw new Error('SecurityError') }),
            removeItem: vi.fn(() => { throw new Error('SecurityError') }),
        }
        vi.stubGlobal('localStorage', throwingStorage)
        vi.resetModules()
        const fresh = await import('../src/composables/useShowTemporaryToggle')
        const { showTemporary, setShowTemporary } = fresh.useShowTemporaryToggle()
        const reset = fresh.__resetShowTemporaryToggleForTesting
        expect(typeof reset).toBe('function')
        // Read throws — defaults to off.
        expect(showTemporary.value).toBe(false)
        // Write throws — the in-memory ref still flips.
        setShowTemporary(true)
        expect(showTemporary.value).toBe(true)
        // Reset helper tolerates the throw too.
        expect(() => reset()).not.toThrow()
        expect(showTemporary.value).toBe(false)
        vi.unstubAllGlobals()
    })
})
