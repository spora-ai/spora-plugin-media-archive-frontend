import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import MediaFolderPicker from '../../src/components/MediaFolderPicker.vue'
import type { MediaFolder } from '../../src/types'

/**
 * A tree with a nested folder: "Corporate" holds "2026", and "Brand"
 * sits beside them. The panel's tree is built from `parent_id`, and a
 * folder's `path` is its path from the tenant root.
 */
const folders: MediaFolder[] = [
    { id: 'folder-1', name: 'Corporate', path: '/Corporate', parent_id: null, asset_count: 4 },
    { id: 'folder-2', name: '2026', path: '/Corporate/2026', parent_id: 'folder-1', asset_count: 2 },
    { id: 'folder-3', name: 'Brand', path: '/Brand', parent_id: null, asset_count: 0 },
]

const mounted: VueWrapper[] = []

function mountPicker(props: {
    folders?: MediaFolder[]
    modelValue?: string | null
    disabled?: boolean
} = {}): VueWrapper {
    const wrapper = mount(MediaFolderPicker, {
        props: {
            folders: props.folders ?? folders,
            modelValue: props.modelValue ?? null,
            disabled: props.disabled ?? false,
            testid: 'picker',
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

describe('MediaFolderPicker.vue', () => {
    it('keeps the menu closed until the toggle is clicked', () => {
        const wrapper = mountPicker()
        expect(wrapper.find('[data-testid="picker-menu"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="picker-toggle"]').attributes('aria-expanded')).toBe('false')
    })

    it('lists the folders as a tree, nested folders indented under their parent', async () => {
        const wrapper = mountPicker()
        await wrapper.find('[data-testid="picker-toggle"]').trigger('click')

        const rows = wrapper.findAll('[role="menuitemradio"]')
        expect(rows.map((row) => row.attributes('data-testid'))).toEqual([
            'picker-option-root',
            'picker-option-folder-3',
            'picker-option-folder-1',
            'picker-option-folder-2',
        ])

        const indent = (testid: string): number =>
            Number.parseFloat(
                (wrapper.find(`[data-testid="${testid}"]`).attributes('style') ?? '')
                    .match(/padding-left:\s*([\d.]+)rem/)?.[1] ?? '0',
            )
        expect(indent('picker-option-folder-2')).toBeGreaterThan(indent('picker-option-folder-1'))
        expect(indent('picker-option-folder-3')).toBe(indent('picker-option-folder-1'))
    })

    it('marks the chosen folder and emits the folder that is picked', async () => {
        const wrapper = mountPicker({ modelValue: 'folder-1' })
        await wrapper.find('[data-testid="picker-toggle"]').trigger('click')

        const chosen = wrapper.find('[data-testid="picker-option-folder-1"]')
        expect(chosen.attributes('aria-checked')).toBe('true')
        expect(wrapper.find('[data-testid="picker-option-folder-2"]').attributes('aria-checked')).toBe('false')

        await wrapper.find('[data-testid="picker-option-folder-2"]').trigger('click')
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['folder-2'])
    })

    it('emits null for the root, so the asset can be taken out of its folder', async () => {
        const wrapper = mountPicker({ modelValue: 'folder-1' })
        await wrapper.find('[data-testid="picker-toggle"]').trigger('click')
        await wrapper.find('[data-testid="picker-option-root"]').trigger('click')
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null])
    })

    it('closes the menu on the choice', async () => {
        const wrapper = mountPicker()
        await wrapper.find('[data-testid="picker-toggle"]').trigger('click')
        await wrapper.find('[data-testid="picker-option-folder-2"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="picker-menu"]').exists()).toBe(false)
    })

    it('shows the path of the chosen folder, so the tree is visible with the menu closed', () => {
        const wrapper = mountPicker({ modelValue: 'folder-2' })
        expect(wrapper.find('[data-testid="picker-toggle"]').text()).toContain('Corporate/2026')
    })

    it('lists a chosen folder it cannot resolve instead of hiding it', async () => {
        // The asset is filed in a folder the panel cannot see. "No
        // folder" would be a false claim, so the row says what is known.
        const wrapper = mountPicker({ modelValue: 'folder-x' })
        expect(wrapper.find('[data-testid="picker-toggle"]').text()).toContain('Unknown folder')
        await wrapper.find('[data-testid="picker-toggle"]').trigger('click')
        const unresolved = wrapper.find('[data-testid="picker-option-unresolved"]')
        expect(unresolved.text()).toContain('Unknown folder')
        expect(unresolved.attributes('aria-checked')).toBe('true')
    })

    it('shows the asset count of every folder', async () => {
        const wrapper = mountPicker()
        await wrapper.find('[data-testid="picker-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="picker-option-folder-1"]').text()).toContain('4')
        expect(wrapper.find('[data-testid="picker-option-folder-3"]').text()).toContain('0')
    })

    it('does not open while it is disabled', async () => {
        const wrapper = mountPicker({ disabled: true })
        const toggle = wrapper.find('[data-testid="picker-toggle"]')
        expect(toggle.attributes('disabled')).toBeDefined()
        await toggle.trigger('click')
        expect(wrapper.find('[data-testid="picker-menu"]').exists()).toBe(false)
    })
})
