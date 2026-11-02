import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaFolderRail from '../src/components/MediaFolderRail.vue'
import type { MediaPrincipal, ScopedMediaFolder } from '../src/types'

const userPrincipal: MediaPrincipal = { id: 101, type: 'user', user_id: 1, group_id: null }
const marketingPrincipal: MediaPrincipal = { id: 202, type: 'group', user_id: null, group_id: 10 }

const folders: ScopedMediaFolder[] = [
    { id: 'folder-1', name: 'Corporate', path: '/Corporate', parent_id: null, asset_count: 12, principal_id: 101 },
    { id: 'folder-2', name: '2026', path: '/Corporate/2026', parent_id: 'folder-1', asset_count: 3, principal_id: 101 },
    { id: 'folder-3', name: 'Brand', path: '/Brand', parent_id: null, asset_count: 0, principal_id: 202 },
]

function mountRail(props: {
    principals?: MediaPrincipal[]
    selectedScope?: number | null
    groupLabels?: Record<number, string>
    myMediaLabel?: string | null
    folders?: ScopedMediaFolder[]
    selectedFolderId?: string | null
} = {}) {
    return mount(MediaFolderRail, {
        props: {
            principals: props.principals ?? [userPrincipal, marketingPrincipal],
            selectedScope: props.selectedScope ?? null,
            groupLabels: props.groupLabels ?? { 202: 'Marketing Team' },
            myMediaLabel: props.myMediaLabel ?? null,
            folders: props.folders ?? folders,
            selectedFolderId: props.selectedFolderId ?? null,
        },
    })
}

/**
 * The indent of a folder row, in rem — the rail indents by the row's
 * depth in the tree.
 */
function indentOf(wrapper: ReturnType<typeof mountRail>, id: string): number {
    const style = wrapper.find(`[data-testid="media-folder-${id}"]`).attributes('style') ?? ''
    const match = /padding-left:\s*([\d.]+)rem/.exec(style)
    return match ? Number(match[1]) : 0
}

describe('MediaFolderRail.vue tree', () => {
    it('renders the root and every folder of the scope', () => {
        const wrapper = mountRail()
        expect(wrapper.find('[data-testid="media-folder-root"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-folder-folder-1"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-folder-folder-2"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-folder-folder-3"]').exists()).toBe(true)
    })

    it('carries the folder path on every row', () => {
        const wrapper = mountRail()
        expect(wrapper.find('[data-testid="media-folder-folder-2"]').attributes('data-folder-path'))
            .toBe('/Corporate/2026')
    })

    it('shows the asset count of each folder', () => {
        const wrapper = mountRail()
        expect(wrapper.find('[data-testid="media-folder-folder-1"]').text()).toContain('12')
        expect(wrapper.find('[data-testid="media-folder-folder-3"]').text()).toContain('0')
    })

    it('names each folder', () => {
        const wrapper = mountRail()
        expect(wrapper.find('[data-testid="media-folder-folder-1"]').text()).toContain('Corporate')
        expect(wrapper.find('[data-testid="media-folder-folder-2"]').text()).toContain('2026')
    })

    it('nests a child folder under its parent', () => {
        const wrapper = mountRail()
        // The child is indented one step further than its parent.
        expect(indentOf(wrapper, 'folder-2')).toBeGreaterThan(indentOf(wrapper, 'folder-1'))
        expect(indentOf(wrapper, 'folder-3')).toBe(indentOf(wrapper, 'folder-1'))
    })

    it('emits the picked folder id', async () => {
        const wrapper = mountRail()
        await wrapper.find('[data-testid="media-folder-folder-2"]').trigger('click')
        expect(wrapper.emitted('update:folderId')?.[0]).toEqual(['folder-2'])
    })

    it('emits null when the root is picked, clearing the folder filter', async () => {
        const wrapper = mountRail({ selectedFolderId: 'folder-1' })
        await wrapper.find('[data-testid="media-folder-root"]').trigger('click')
        expect(wrapper.emitted('update:folderId')?.[0]).toEqual([null])
    })

    it('marks the selected folder as pressed', () => {
        const wrapper = mountRail({ selectedFolderId: 'folder-2' })
        expect(wrapper.find('[data-testid="media-folder-folder-2"]').attributes('aria-pressed')).toBe('true')
        expect(wrapper.find('[data-testid="media-folder-folder-1"]').attributes('aria-pressed')).toBe('false')
    })

    it('marks the root as pressed while no folder is selected', () => {
        const root = mountRail({ selectedFolderId: null })
        expect(root.find('[data-testid="media-folder-root"]').attributes('aria-pressed')).toBe('true')

        const scoped = mountRail({ selectedFolderId: 'folder-1' })
        expect(scoped.find('[data-testid="media-folder-root"]').attributes('aria-pressed')).toBe('false')
    })
})

describe('MediaFolderRail.vue grouping by principal', () => {
    it('groups the tree by principal in the all-principals scope', () => {
        const wrapper = mountRail({ selectedScope: null })
        expect(wrapper.find('[data-testid="media-rail-group-101"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-rail-group-202"]').exists()).toBe(true)
    })

    it('names the group by its principal', () => {
        const wrapper = mountRail({ selectedScope: null })
        expect(wrapper.find('[data-testid="media-rail-group-101"]').text()).toContain('My Media')
        expect(wrapper.find('[data-testid="media-rail-group-202"]').text()).toContain('Marketing Team')
    })

    it('counts the folders the principal owns in the group heading', () => {
        // The count is what tells the operator how much is filed under
        // that principal before they open the group.
        const wrapper = mountRail({ selectedScope: null })
        const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()
        expect(collapse(wrapper.find('[data-testid="media-rail-group-101"]').text())).toBe('My Media2')
        expect(collapse(wrapper.find('[data-testid="media-rail-group-202"]').text())).toBe('Marketing Team1')
    })

    it('scopes the scope to the principal of a clicked group heading', async () => {
        const wrapper = mountRail({ selectedScope: null })
        await wrapper.find('[data-testid="media-rail-group-202"]').trigger('click')
        expect(wrapper.emitted('update:scope')?.[0]).toEqual([202])
    })

    it('has no group heading in a single-principal scope', () => {
        // The scope dropdown above already says whose tree this is.
        const wrapper = mountRail({ selectedScope: 101 })
        expect(wrapper.find('[data-testid="media-rail-group-101"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="media-rail-group-202"]').exists()).toBe(false)
    })

    it('shows only the scoped principal\'s folders in a single-principal scope', () => {
        const wrapper = mountRail({ selectedScope: 101 })
        expect(wrapper.find('[data-testid="media-folder-folder-1"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-folder-folder-3"]').exists()).toBe(false)
    })

    it('has no group heading when only one principal is visible', () => {
        // One principal cannot be grouped — there is nothing to
        // disambiguate.
        const wrapper = mountRail({ principals: [userPrincipal] })
        expect(wrapper.find('[data-testid="media-rail-group-101"]').exists()).toBe(false)
    })
})

describe('MediaFolderRail.vue empty state', () => {
    it('shows an empty state for a principal without folders', () => {
        const wrapper = mountRail({
            folders: [
                { id: 'folder-1', name: 'Corporate', path: '/Corporate', parent_id: null, asset_count: 2, principal_id: 101 },
            ],
        })
        const empty = wrapper.findAll('[data-testid="media-folder-empty"]')
        expect(empty).toHaveLength(1)
        expect(empty[0].text()).toContain('No folders')
    })

    it('shows an empty state when the scoped principal has no folders', () => {
        const wrapper = mountRail({ selectedScope: 202, folders: [] })
        expect(wrapper.find('[data-testid="media-folder-empty"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-folder-folder-1"]').exists()).toBe(false)
    })
})

describe('MediaFolderRail.vue controls', () => {
    it('offers a New folder button that asks for a new folder', async () => {
        const wrapper = mountRail()
        await wrapper.find('[data-testid="media-new-folder-button"]').trigger('click')
        expect(wrapper.emitted('new-folder')).toHaveLength(1)
    })

    it('offers no New folder button when there is no principal to file it under', () => {
        // A folder belongs to one principal; with none visible there is
        // nowhere to put it.
        const wrapper = mountRail({ principals: [] })
        expect(wrapper.find('[data-testid="media-new-folder-button"]').exists()).toBe(false)
    })

    it('offers a close button that asks to be closed', async () => {
        const wrapper = mountRail()
        await wrapper.find('[data-testid="media-rail-close"]').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('carries the scope dropdown and emits the picked principal', async () => {
        const wrapper = mountRail()
        await wrapper.find('[data-testid="media-scope-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-scope-menu"]').exists()).toBe(true)
        await wrapper.find('[data-testid="media-scope-option-202"]').trigger('click')
        expect(wrapper.emitted('update:scope')?.[0]).toEqual([202])
    })
})
