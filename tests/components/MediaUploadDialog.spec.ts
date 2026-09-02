import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MediaUploadDialog from '../../src/components/MediaUploadDialog.vue'
import type { MediaAsset, MediaPrincipal } from '../../src/types'
import type { PluginHostContext } from '../../src/shims'

const principals: MediaPrincipal[] = [
    { id: 101, type: 'user', user_id: 1, group_id: null },
    { id: 202, type: 'group', user_id: null, group_id: 10 },
]

const groupLabels: Record<number, string> = {
    202: 'Marketing Team',
}

const sampleAsset: MediaAsset = {
    id: 'asset-1',
    media_type: 'image',
    mime_type: 'image/png',
    byte_size: 4096,
    width: 64,
    height: 64,
    duration_seconds: null,
    prompt: null,
    filename: 'shot.png',
    markdown_content: null,
    tags: null,
    asset_url: '/api/v1/assets/asset-1.png',
    source_url: null,
    storage_mode: 'local',
    plugin_slug: null,
    tool_name: null,
    agent_id: null,
    task_id: null,
    tool_call_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    derivatives: [],
}

interface Harness {
    api: {
        get: ReturnType<typeof vi.fn>
        post: ReturnType<typeof vi.fn>
        postForm: ReturnType<typeof vi.fn>
        patch: ReturnType<typeof vi.fn>
        delete: ReturnType<typeof vi.fn>
    }
    hostContext: PluginHostContext
}

interface DialogProps {
    hostContext: PluginHostContext
    principals: MediaPrincipal[]
    groupLabels: Record<number, string>
    defaultPrincipalId: number | null
}

function buildHost(overrides?: {
    postForm?: (path: string, body: FormData) => Promise<MediaAsset>
    allowedTypes?: { mime_types: string[]; extensions: string[] }
}): Harness {
    const allowedTypes = overrides?.allowedTypes ?? { mime_types: ['image/png'], extensions: ['.png'] }
    const get = vi.fn().mockImplementation((path: string) => {
        if (path === '/media/allowed-types') {
            return Promise.resolve(allowedTypes)
        }
        return Promise.reject(new Error(`Unexpected GET ${path}`))
    })
    const postForm = vi.fn()
    if (overrides?.postForm) {
        postForm.mockImplementation(overrides.postForm)
    } else {
        postForm.mockResolvedValue(sampleAsset)
    }
    const api = {
        get,
        post: vi.fn(),
        postForm,
        patch: vi.fn(),
        delete: vi.fn(),
    }
    const hostContext: PluginHostContext = {
        api: api as unknown as PluginHostContext['api'],
        pinia: null,
        theme: 'light',
        route: null,
        router: null,
    }
    return { api, hostContext }
}

function dialogProps(harness: Harness, defaultPrincipalId: number | null): DialogProps {
    return {
        hostContext: harness.hostContext,
        principals,
        groupLabels,
        defaultPrincipalId,
    }
}

/**
 * Set the file list on an `<input type="file">` via DataTransfer.
 * happy-dom's HTMLInputElement setter for `.files` is gated; defining
 * the property works across runners (jsdom, happy-dom, real browsers).
 */
function setInputFiles(input: HTMLInputElement, file: File): void {
    const dt = new DataTransfer()
    dt.items.add(file)
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true })
}

/**
 * happy-dom is strict: `input.dispatchEvent('change')` rejects a bare
 * string. We synthesize the `Event` ourselves rather than going
 * through Vue Test Utils so each test reads in one straight line.
 */
function fireChange(input: HTMLInputElement): void {
    input.dispatchEvent(new Event('change', { bubbles: true }))
}

function submitForm(): HTMLButtonElement {
    return document.querySelector('[data-testid="upload-submit"]') as HTMLButtonElement
}

function fileInput(): HTMLInputElement {
    return document.querySelector('[data-testid="upload-file-input"]') as HTMLInputElement
}

function principalSelect(): HTMLSelectElement {
    return document.querySelector('[data-testid="upload-principal-select"]') as HTMLSelectElement
}

function uploadDialog(): HTMLDialogElement {
    return document.querySelector('[data-testid="media-upload-dialog"]') as HTMLDialogElement
}

function uploadBackdrop(): HTMLElement {
    return document.querySelector('[data-testid="upload-dialog-backdrop"]') as HTMLElement
}

beforeEach(() => {
    // happy-dom ships an unimplemented HTMLDialogElement; patch the
    // two methods the dialog uses so `open()` / `close()` exercise the
    // real visibility state.
    if (typeof HTMLDialogElement !== 'undefined') {
        HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
            this.open = true
        }
        HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
            this.open = false
        }
    }
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('MediaUploadDialog', () => {
    it('lists every principal with the correct label', async () => {
        const harness = buildHost()
        const wrapper = mount(MediaUploadDialog, {
            props: dialogProps(harness, null),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        const options = Array.from(principalSelect().options)
        expect(options).toHaveLength(principals.length)
        expect(options[0]?.text).toBe('My Media')
        expect(options[1]?.text).toBe('Marketing Team')
        wrapper.unmount()
    })

    it('disables submit when no file is picked', async () => {
        const harness = buildHost()
        const wrapper = mount(MediaUploadDialog, {
            props: dialogProps(harness, 101),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        expect(submitForm().disabled).toBe(true)
        expect(harness.api.postForm).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('submits the form with a file and a valid principal', async () => {
        const harness = buildHost()
        const wrapper = mount(MediaUploadDialog, {
            props: dialogProps(harness, 101),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        const file = new File(['binary'], 'shot.png', { type: 'image/png' })
        const input = fileInput()
        setInputFiles(input, file)
        fireChange(input)
        await flushPromises()
        expect(submitForm().disabled).toBe(false)
        submitForm().click()
        await flushPromises()
        expect(harness.api.postForm).toHaveBeenCalledTimes(1)
        const [path, form] = harness.api.postForm.mock.calls[0] ?? []
        expect(path).toBe('/media')
        expect(form).toBeInstanceOf(FormData)
        expect((form as FormData).get('principal_id')).toBe('101')
        const submittedFile = (form as FormData).get('file') as File
        expect(submittedFile.name).toBe(file.name)
        expect(submittedFile.type).toBe(file.type)
        wrapper.unmount()
    })

    it('falls back to the user-principal when defaultPrincipalId is null', async () => {
        const harness = buildHost()
        const wrapper = mount(MediaUploadDialog, {
            props: dialogProps(harness, null),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        const file = new File(['b'], 'pixel.png', { type: 'image/png' })
        const input = fileInput()
        setInputFiles(input, file)
        fireChange(input)
        await flushPromises()
        submitForm().click()
        await flushPromises()
        const [, form] = harness.api.postForm.mock.calls[0] ?? []
        expect((form as FormData).get('principal_id')).toBe('101')
        wrapper.unmount()
    })

    it('uses defaultPrincipalId when provided and valid', async () => {
        const harness = buildHost()
        const wrapper = mount(MediaUploadDialog, {
            // Pass a group-principal id — must override the user-principal fallback.
            props: dialogProps(harness, 202),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        const file = new File(['b'], 'a4.pdf', { type: 'application/pdf' })
        const input = fileInput()
        setInputFiles(input, file)
        fireChange(input)
        await flushPromises()
        submitForm().click()
        await flushPromises()
        const [, form] = harness.api.postForm.mock.calls[0] ?? []
        expect((form as FormData).get('principal_id')).toBe('202')
        wrapper.unmount()
    })

    it('surfaces FORBIDDEN_PRINCIPAL inline', async () => {
        const err: Error & { code?: string } = new Error('You can only upload into a principal you belong to.')
        err.code = 'FORBIDDEN_PRINCIPAL'
        const harness = buildHost({ postForm: () => Promise.reject(err) })
        const wrapper = mount(MediaUploadDialog, {
            props: dialogProps(harness, 101),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        const file = new File(['b'], 'shot.png', { type: 'image/png' })
        const input = fileInput()
        setInputFiles(input, file)
        fireChange(input)
        await flushPromises()
        submitForm().click()
        await flushPromises()
        expect(harness.api.postForm).toHaveBeenCalled()
        const banner = document.querySelector('[data-testid="upload-error"]')
        expect(banner?.textContent).toContain('principal you belong to')
        // The asset is NOT emitted on a 403 — the dialog stays open so
        // the operator can pick a different principal.
        const dialog = document.querySelector('[data-testid="media-upload-dialog"]') as HTMLDialogElement
        expect(dialog.open).toBe(true)
        wrapper.unmount()
    })

    it('emits uploaded with the new asset on a 2xx response', async () => {
        const harness = buildHost({ postForm: () => Promise.resolve(sampleAsset) })
        const wrapper = mount(MediaUploadDialog, {
            props: dialogProps(harness, 101),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        const file = new File(['b'], 'shot.png', { type: 'image/png' })
        const input = fileInput()
        setInputFiles(input, file)
        fireChange(input)
        await flushPromises()
        submitForm().click()
        await flushPromises()
        const emitted = wrapper.emitted('uploaded')
        expect(emitted).toBeDefined()
        expect(emitted?.[0]?.[0]).toMatchObject({ id: sampleAsset.id })
        wrapper.unmount()
    })

    it('closes the dialog when the backdrop is clicked directly', async () => {
        const harness = buildHost()
        const wrapper = mount(MediaUploadDialog, {
            props: dialogProps(harness, 101),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        const dialog = uploadDialog()
        const backdrop = uploadBackdrop()
        expect(dialog.open).toBe(true)
        // `@click.self` semantics: only fire when target === currentTarget,
        // i.e. the click lands on the backdrop element itself rather than
        // any of its descendants. We synthesise that explicitly.
        backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()
        expect(dialog.open).toBe(false)
        expect(wrapper.emitted('close')).toBeDefined()
        wrapper.unmount()
    })

    it('does not close when the click lands on the inner card', async () => {
        const harness = buildHost()
        const wrapper = mount(MediaUploadDialog, {
            props: dialogProps(harness, 101),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        const dialog = uploadDialog()
        // A click that bubbles from the inner card should be stopped by the
        // card's `@click.stop` handler before reaching `@click.self` on the
        // backdrop wrapper.
        dialog.querySelector('[data-testid="media-upload-form"]')!.dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        )
        await flushPromises()
        expect(dialog.open).toBe(true)
        expect(wrapper.emitted('close')).toBeUndefined()
        wrapper.unmount()
    })

    it('closes the dialog when the native cancel event fires (Escape key)', async () => {
        const harness = buildHost()
        const wrapper = mount(MediaUploadDialog, {
            props: dialogProps(harness, 101),
            attachTo: document.body,
        })
        wrapper.vm.open()
        await flushPromises()
        const dialog = uploadDialog()
        expect(dialog.open).toBe(true)
        // `<dialog>` raises `cancel` (cancellable) when the user presses
        // Escape. `@cancel.prevent` runs `close()`, which calls the native
        // `close()` (flipping `open` to false) and emits `close` to the
        // parent so the `v-if` unmounts the component.
        dialog.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
        await flushPromises()
        expect(dialog.open).toBe(false)
        expect(wrapper.emitted('close')).toBeDefined()
        wrapper.unmount()
    })
})
