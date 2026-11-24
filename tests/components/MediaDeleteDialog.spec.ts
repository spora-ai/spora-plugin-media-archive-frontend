import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaDeleteDialog from '../../src/components/MediaDeleteDialog.vue'

describe('MediaDeleteDialog.vue', () => {
    const props = {
        title: 'Delete 2 assets?',
        description: '2 assets will be permanently deleted.',
    }

    it('mounts the live region with the dialog and leaves it empty when there is nothing to warn about', () => {
        // The warning arrives after the dialog is open, so the region has
        // to be there before the text is — a region that mounts together
        // with its text is not announced.
        // https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22
        const wrapper = mount(MediaDeleteDialog, { props })
        const status = wrapper.find('[data-testid="delete-warning-status"]')
        expect(status.exists()).toBe(true)
        expect(status.text()).toBe('')
        expect(wrapper.find('[data-testid="delete-warning"]').exists()).toBe(false)
    })

    it('carries the warning in the live region once it arrives', async () => {
        const wrapper = mount(MediaDeleteDialog, { props })
        await wrapper.setProps({ warning: '2 selected assets are used in chats.' })
        expect(wrapper.find('[data-testid="delete-warning-status"]').text()).toContain('2 selected assets are used in chats.')
        expect(wrapper.find('[data-testid="delete-warning"]').exists()).toBe(true)
    })

    it('describes the dialog with the warning', () => {
        const wrapper = mount(MediaDeleteDialog, { props })
        const statusId = wrapper.find('[data-testid="delete-warning-status"]').attributes('id') ?? ''
        expect(statusId).not.toBe('')
        expect(wrapper.find('[data-testid="delete-confirm-dialog"]').attributes('aria-describedby')).toContain(statusId)
    })

    it('does not offer the confirmation while the lookup is running', async () => {
        // A deletion confirmed before its consequence is known is the
        // case the warning exists for.
        const wrapper = mount(MediaDeleteDialog, { props: { ...props, checking: 'Checking…' } })

        expect(wrapper.find('[data-testid="delete-checking"]').text()).toBe('Checking…')
        expect(wrapper.find('[data-testid="delete-confirm"]').attributes('disabled')).toBeDefined()
        await wrapper.find('[data-testid="delete-confirm"]').trigger('click')
        expect(wrapper.emitted('confirm')).toBeUndefined()

        await wrapper.setProps({ checking: '' })
        expect(wrapper.find('[data-testid="delete-checking"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="delete-confirm"]').attributes('disabled')).toBeUndefined()
    })
})
