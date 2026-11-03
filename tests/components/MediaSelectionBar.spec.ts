import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaSelectionBar from '../../src/components/MediaSelectionBar.vue'

describe('MediaSelectionBar.vue', () => {
    it('counts the selected assets', () => {
        const wrapper = mount(MediaSelectionBar, { props: { count: 3 } })
        expect(wrapper.find('[data-testid="media-selection-count"]').text()).toContain('3 assets selected')
    })

    it('offers the actions that work on several assets', async () => {
        const wrapper = mount(MediaSelectionBar, { props: { count: 2 } })

        await wrapper.find('[data-testid="media-selection-move"]').trigger('click')
        expect(wrapper.emitted('move')).toHaveLength(1)

        await wrapper.find('[data-testid="media-selection-delete"]').trigger('click')
        expect(wrapper.emitted('delete')).toHaveLength(1)

        await wrapper.find('[data-testid="media-selection-cancel"]').trigger('click')
        expect(wrapper.emitted('cancel')).toHaveLength(1)
    })

    it('offers to clear the selection when everything is selected', async () => {
        const wrapper = mount(MediaSelectionBar, { props: { count: 2, allSelected: true } })
        const button = wrapper.find('[data-testid="media-selection-select-all"]')
        expect(button.text()).toContain('Deselect all')
        await button.trigger('click')
        expect(wrapper.emitted('select-all')).toHaveLength(1)
    })

    it('disables the actions while one is running', () => {
        const wrapper = mount(MediaSelectionBar, { props: { count: 2, busy: true } })
        expect(wrapper.find('[data-testid="media-selection-move"]').attributes('disabled')).toBeDefined()
        expect(wrapper.find('[data-testid="media-selection-delete"]').attributes('disabled')).toBeDefined()
    })
})
