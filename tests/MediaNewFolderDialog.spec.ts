import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import MediaNewFolderDialog from '../src/components/MediaNewFolderDialog.vue'
import type { MediaFolder, MediaPrincipal } from '../src/types'
import type { PluginHostContext } from '../src/shims'

const principals: MediaPrincipal[] = [
    { id: 101, type: 'user', user_id: 1, group_id: null },
    { id: 202, type: 'group', user_id: null, group_id: 10 },
]

/**
 * The folders of each principal, mirroring what the server answers per
 * principal.
 */
const foldersByPrincipal: Record<number, MediaFolder[]> = {
    101: [
        { id: 'folder-1', name: 'Corporate', path: '/Corporate', parent_id: null, asset_count: 2 },
        { id: 'folder-2', name: '2026', path: '/Corporate/2026', parent_id: 'folder-1', asset_count: 1 },
    ],
    202: [
        { id: 'folder-3', name: 'Brand', path: '/Brand', parent_id: null, asset_count: 4 },
    ],
}

const createdFolder: MediaFolder = {
    id: 'folder-9',
    name: 'Q3',
    path: '/Q3',
    parent_id: null,
    asset_count: 0,
}

function buildHost(post?: ReturnType<typeof vi.fn>): PluginHostContext {
    const api = {
        get: vi.fn(),
        post: post ?? vi.fn().mockResolvedValue(createdFolder),
        postForm: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    }
    return {
        api: api as unknown as PluginHostContext['api'],
        pinia: null,
        locale: 'en',
        theme: 'light',
        route: null,
        router: null,
    }
}

/**
 * The dialog is mounted into the document: a submit button only hands the
 * form over to the browser's implicit submission when it is connected, so
 * a detached tree would never post.
 */
const mounted: VueWrapper[] = []

function mountDialog(props: {
    hostContext?: PluginHostContext
    principals?: MediaPrincipal[]
    defaultPrincipalId?: number | null
    defaultParentId?: string | null
} = {}) {
    const wrapper = mount(MediaNewFolderDialog, {
        props: {
            hostContext: props.hostContext ?? buildHost(),
            principals: props.principals ?? principals,
            foldersByPrincipal,
            // `null` is a meaningful value here — "no principal chosen" —
            // so the default only applies when the caller said nothing.
            defaultPrincipalId: 'defaultPrincipalId' in props ? props.defaultPrincipalId : 101,
            defaultParentId: props.defaultParentId ?? null,
        },
        attachTo: document.body,
    })
    mounted.push(wrapper)
    return wrapper
}

/**
 * Press the submit button the way the browser does: the click has to
 * reach the button itself, so the form submits it.
 */
function pressSubmit(wrapper: VueWrapper): void {
    const button = wrapper.find('[data-testid="media-new-folder-submit"]').element as HTMLButtonElement
    button.click()
}

afterEach(() => {
    while (mounted.length > 0) {
        mounted.pop()?.unmount()
    }
    document.body.innerHTML = ''
})

describe('MediaNewFolderDialog.vue opening', () => {
    it('opens itself as a modal dialog', () => {
        const wrapper = mountDialog()
        const dialog = wrapper.find('[data-testid="media-new-folder-dialog"]')
        expect(dialog.exists()).toBe(true)
        expect((dialog.element as HTMLDialogElement).open).toBe(true)
    })

    it('offers the parent picker the folders of the chosen principal', () => {
        const wrapper = mountDialog({ defaultPrincipalId: 101 })
        expect(wrapper.find('[data-testid="media-new-folder-parent-folder-1"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-new-folder-parent-folder-2"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-new-folder-parent-folder-3"]').exists()).toBe(false)
    })

    it('emits close when the dialog is cancelled', async () => {
        const wrapper = mountDialog()
        await wrapper.find('[data-testid="media-new-folder-cancel"]').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('MediaNewFolderDialog.vue path preview', () => {
    it('previews the name alone when there is no parent', async () => {
        const wrapper = mountDialog()
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        expect(wrapper.find('[data-testid="media-new-folder-path"]').text()).toContain('Q3')
        expect(wrapper.find('[data-testid="media-new-folder-path"]').text()).not.toContain('/')
    })

    it('previews the parent path in front of the name', async () => {
        const wrapper = mountDialog()
        await wrapper.find('[data-testid="media-new-folder-parent-folder-1"]').trigger('click')
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        // The server builds the path from the parent's path plus the name.
        expect(wrapper.find('[data-testid="media-new-folder-path"]').text()).toContain('Corporate / Q3')
    })

    it('shows no preview while the name is empty', () => {
        const wrapper = mountDialog()
        expect(wrapper.find('[data-testid="media-new-folder-path"]').exists()).toBe(false)
    })
})

describe('MediaNewFolderDialog.vue submitting', () => {
    it('posts the name, the parent and the principal', async () => {
        const post = vi.fn().mockResolvedValue(createdFolder)
        const wrapper = mountDialog({ hostContext: buildHost(post) })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        await wrapper.find('[data-testid="media-new-folder-parent-folder-1"]').trigger('click')
        pressSubmit(wrapper)
        await flushPromises()
        expect(post).toHaveBeenCalledTimes(1)
        expect(post).toHaveBeenCalledWith('/media/folders', {
            name: 'Q3',
            parent_id: 'folder-1',
            principal_id: 101,
        })
    })

    it('posts a null parent when the folder sits at the root', async () => {
        const post = vi.fn().mockResolvedValue(createdFolder)
        const wrapper = mountDialog({ hostContext: buildHost(post) })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        pressSubmit(wrapper)
        await flushPromises()
        expect(post).toHaveBeenCalledWith('/media/folders', {
            name: 'Q3',
            parent_id: null,
            principal_id: 101,
        })
    })

    it('emits created with the folder and its principal', async () => {
        const post = vi.fn().mockResolvedValue(createdFolder)
        const wrapper = mountDialog({ hostContext: buildHost(post) })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        pressSubmit(wrapper)
        await flushPromises()
        expect(wrapper.emitted('created')?.[0]).toEqual([{ folder: createdFolder, principalId: 101 }])
    })

    it('closes itself once the folder exists', async () => {
        const post = vi.fn().mockResolvedValue(createdFolder)
        const wrapper = mountDialog({ hostContext: buildHost(post) })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        pressSubmit(wrapper)
        await flushPromises()
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('refuses to post an empty name', async () => {
        const post = vi.fn()
        const wrapper = mountDialog({ hostContext: buildHost(post) })
        pressSubmit(wrapper)
        await flushPromises()
        expect(post).not.toHaveBeenCalled()
        expect(wrapper.find('[data-testid="media-new-folder-error"]').text()).toContain('Give the folder a name.')
    })

    it('refuses to post without a principal', async () => {
        const post = vi.fn()
        const wrapper = mountDialog({
            hostContext: buildHost(post),
            principals: [],
            defaultPrincipalId: null,
        })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        pressSubmit(wrapper)
        await flushPromises()
        expect(post).not.toHaveBeenCalled()
        expect(wrapper.find('[data-testid="media-new-folder-error"]').text()).toContain('Choose the principal')
    })

    it('falls back to the first visible principal when the scope names none', async () => {
        // A folder always belongs to one principal, and the "all
        // principals" scope names none — so the dialog picks the first
        // visible one, which is the default the server falls back to.
        const post = vi.fn().mockResolvedValue(createdFolder)
        const wrapper = mountDialog({ hostContext: buildHost(post), defaultPrincipalId: null })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        pressSubmit(wrapper)
        await flushPromises()
        expect(post).toHaveBeenCalledWith('/media/folders', {
            name: 'Q3',
            parent_id: null,
            principal_id: 101,
        })
    })

    it('takes the owner from the chosen parent, not from the scope', async () => {
        // The server refuses a parent of another principal with a 404,
        // so an overlay that opened on one principal's parent and
        // another's owner would be offering a combination that cannot be
        // created. The parent decides the owner.
        const post = vi.fn().mockResolvedValue(createdFolder)
        const wrapper = mountDialog({
            hostContext: buildHost(post),
            defaultPrincipalId: 101,
            defaultParentId: 'folder-3',
        })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        pressSubmit(wrapper)
        await flushPromises()
        expect(post).toHaveBeenCalledWith('/media/folders', {
            name: 'Q3',
            parent_id: 'folder-3',
            principal_id: 202,
        })
    })
})

describe('MediaNewFolderDialog.vue errors', () => {
    it('names the duplicate when the folder already exists there', async () => {
        const post = vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'NOT_UNIQUE' }))
        const wrapper = mountDialog({ hostContext: buildHost(post) })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        pressSubmit(wrapper)
        await flushPromises()
        const error = wrapper.find('[data-testid="media-new-folder-error"]')
        expect(error.exists()).toBe(true)
        expect(error.text()).toContain('already exists here')
        expect(error.text()).toContain('Q3')
        // The dialog stays open — the operator can rename and retry.
        expect(wrapper.emitted('created')).toBeUndefined()
        expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('shows the server\'s message for any other refusal', async () => {
        const post = vi.fn().mockRejectedValue(Object.assign(new Error('Principal is not yours'), { code: 'FORBIDDEN' }))
        const wrapper = mountDialog({ hostContext: buildHost(post) })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        pressSubmit(wrapper)
        await flushPromises()
        expect(wrapper.find('[data-testid="media-new-folder-error"]').text()).toContain('Principal is not yours')
    })

    it('falls back to a generic message when the refusal carries none', async () => {
        const post = vi.fn().mockRejectedValue(new Error(''))
        const wrapper = mountDialog({ hostContext: buildHost(post) })
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        pressSubmit(wrapper)
        await flushPromises()
        expect(wrapper.find('[data-testid="media-new-folder-error"]').text())
            .toContain('The folder could not be created.')
    })
})

describe('MediaNewFolderDialog.vue principal change', () => {
    it('drops the chosen parent when the principal changes', async () => {
        // A parent belongs to one principal: keeping it would file the
        // new folder under a folder the new principal cannot see.
        const post = vi.fn().mockResolvedValue(createdFolder)
        const wrapper = mountDialog({ hostContext: buildHost(post) })
        await wrapper.find('[data-testid="media-new-folder-parent-folder-1"]').trigger('click')
        await wrapper.find('[data-testid="media-new-folder-name"]').setValue('Q3')
        expect(wrapper.find('[data-testid="media-new-folder-path"]').text()).toContain('Corporate / Q3')

        await wrapper.find('[data-testid="media-new-folder-principal"]').setValue('202')
        expect(wrapper.find('[data-testid="media-new-folder-path"]').text()).not.toContain('Corporate')

        pressSubmit(wrapper)
        await flushPromises()
        expect(post).toHaveBeenCalledWith('/media/folders', {
            name: 'Q3',
            parent_id: null,
            principal_id: 202,
        })
    })

    it('offers the new principal\'s folders after the change', async () => {
        const wrapper = mountDialog()
        await wrapper.find('[data-testid="media-new-folder-principal"]').setValue('202')
        expect(wrapper.find('[data-testid="media-new-folder-parent-folder-3"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="media-new-folder-parent-folder-1"]').exists()).toBe(false)
    })
})
