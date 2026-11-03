import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MediaMoveDialog from '../../src/components/MediaMoveDialog.vue'
import type { MediaAsset, MediaFolder, MediaPrincipal } from '../../src/types'
import type { PluginHostContext } from '../../src/shims'

const principals: MediaPrincipal[] = [
    { id: 101, type: 'user', user_id: 1, group_id: null },
    { id: 202, type: 'group', user_id: null, group_id: 10 },
]

const groupLabels: Record<number, string> = { 202: 'Marketing Team' }

const foldersByPrincipal: Record<number, MediaFolder[]> = {
    101: [
        { id: 'folder-1', name: 'Corporate', path: '/Corporate', parent_id: null, asset_count: 2 },
        { id: 'folder-2', name: '2026', path: '/Corporate/2026', parent_id: 'folder-1', asset_count: 1 },
    ],
    202: [
        { id: 'folder-3', name: 'Brand', path: '/Brand', parent_id: null, asset_count: 4 },
    ],
}

function asset(id: string, principalId: number | null): MediaAsset {
    return {
        id,
        media_type: 'image',
        mime_type: 'image/png',
        byte_size: 1024,
        width: 8,
        height: 8,
        duration_seconds: null,
        prompt: null,
        filename: `${id}.png`,
        tags: null,
        asset_url: '/api/v1/assets/x.png',
        source_url: null,
        storage_mode: 'local',
        plugin_slug: null,
        tool_name: null,
        agent_id: null,
        task_id: null,
        tool_call_id: null,
        created_at: new Date().toISOString(),
        derivatives: [],
        principal_id: principalId,
    }
}

function buildHost(patch?: ReturnType<typeof vi.fn>): {
    hostContext: PluginHostContext
    patch: ReturnType<typeof vi.fn>
} {
    const mock = patch ?? vi.fn()
    if (patch === undefined) {
        mock.mockResolvedValue(asset('moved', 101))
    }
    const api = {
        get: vi.fn(),
        post: vi.fn(),
        postForm: vi.fn(),
        patch: mock,
        delete: vi.fn(),
    }
    return {
        patch: mock,
        hostContext: {
            api: api as unknown as PluginHostContext['api'],
            pinia: null,
            locale: 'en',
            theme: 'light',
            route: null,
            router: null,
        },
    }
}

function mountDialog(assets: MediaAsset[], patch?: ReturnType<typeof vi.fn>) {
    const host = buildHost(patch)
    const wrapper = mount(MediaMoveDialog, {
        props: {
            hostContext: host.hostContext,
            assets,
            principals,
            groupLabels,
            foldersByPrincipal,
        },
        attachTo: document.body,
    })
    return { wrapper, patch: host.patch }
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('MediaMoveDialog.vue', () => {
    it('files every selected asset into the chosen folder', async () => {
        const { wrapper, patch } = mountDialog([asset('a', 101), asset('b', 101)])

        await wrapper.find('[data-testid="media-move-folder-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-move-folder-option-folder-1"]').trigger('click')
        ;(wrapper.find('[data-testid="media-move-submit"]').element as HTMLButtonElement).click()
        await flushPromises()

        expect(patch).toHaveBeenCalledTimes(2)
        expect(patch).toHaveBeenCalledWith('/media/a', { folder_id: 'folder-1' })
        expect(patch).toHaveBeenCalledWith('/media/b', { folder_id: 'folder-1' })

        const emitted = wrapper.emitted('moved')
        expect(emitted?.[0]?.[0]).toMatchObject({ skipped: 0, failed: 0 })
        wrapper.unmount()
    })

    it('offers the folders of the principal the selection belongs to', async () => {
        const { wrapper } = mountDialog([asset('a', 101)])

        await wrapper.find('[data-testid="media-move-folder-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-move-folder-option-folder-1"]').exists()).toBe(true)
        // The other principal's folders are not offered: the server
        // refuses a folder of another principal.
        expect(wrapper.find('[data-testid="media-move-folder-option-folder-3"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('says how many assets belong to another principal and stay where they are', async () => {
        const { wrapper, patch } = mountDialog([asset('a', 101), asset('b', 202)])

        expect(wrapper.find('[data-testid="media-move-skipped"]').text()).toContain('1')
        // The principal is asked for, because the selection spans two.
        expect(wrapper.find('[data-testid="media-move-principal"]').exists()).toBe(true)

        await wrapper.find('[data-testid="media-move-folder-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-move-folder-option-folder-1"]').trigger('click')
        ;(wrapper.find('[data-testid="media-move-submit"]').element as HTMLButtonElement).click()
        await flushPromises()

        // Only the asset of the chosen principal is filed.
        expect(patch).toHaveBeenCalledTimes(1)
        expect(patch).toHaveBeenCalledWith('/media/a', { folder_id: 'folder-1' })
        expect(wrapper.emitted('moved')?.[0]?.[0]).toMatchObject({ skipped: 1 })
        wrapper.unmount()
    })

    it('counts the assets the server refused', async () => {
        const patch = vi.fn().mockImplementation((path: string) => {
            if (path === '/media/b') {
                return Promise.reject(new Error('taken'))
            }
            return Promise.resolve(asset('a', 101))
        })
        const { wrapper } = mountDialog([asset('a', 101), asset('b', 101)], patch)

        await wrapper.find('[data-testid="media-move-folder-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-move-folder-option-folder-1"]').trigger('click')
        ;(wrapper.find('[data-testid="media-move-submit"]').element as HTMLButtonElement).click()
        await flushPromises()

        expect(patch).toHaveBeenCalledTimes(2)
        expect(wrapper.emitted('moved')?.[0]?.[0]).toMatchObject({ failed: 1 })
        wrapper.unmount()
    })

    it('takes the assets out of their folder when the root is picked', async () => {
        const { wrapper, patch } = mountDialog([asset('a', 101)])

        await wrapper.find('[data-testid="media-move-folder-toggle"]').trigger('click')
        await wrapper.find('[data-testid="media-move-folder-option-root"]').trigger('click')
        ;(wrapper.find('[data-testid="media-move-submit"]').element as HTMLButtonElement).click()
        await flushPromises()

        expect(patch).toHaveBeenCalledWith('/media/a', { folder_id: null })
        wrapper.unmount()
    })
})
