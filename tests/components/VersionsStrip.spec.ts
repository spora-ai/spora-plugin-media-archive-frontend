import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import VersionsStrip from '../../src/components/VersionsStrip.vue'
import type { MediaAsset, MediaDerivative } from '../../src/types'
import type { PluginHostContext } from '../../src/shims'
import type { DerivativeOption } from '../../src/composables/useMediaDerivatives'

const baseAsset: MediaAsset = {
    id: 'parent-1',
    media_type: 'image',
    mime_type: 'image/png',
    byte_size: 4096,
    width: 64,
    height: 64,
    duration_seconds: null,
    prompt: 'A source image',
    filename: 'source.png',
    markdown_content: null,
    tags: null,
    asset_url: '/api/v1/assets/parent-1.png',
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

function makeDerivative(format: string, id: string): MediaDerivative {
    return {
        format,
        media_id: id,
        asset_url: `/api/v1/assets/${id}.${format}`,
        producer_plugin: 'typst',
        producer_operation: 'render',
        created_at: '2026-01-01T00:00:01.000Z',
    }
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

function buildHost(opts?: {
    options?: DerivativeOption[]
    producedAsset?: MediaAsset | Error
    postError?: Error
}): Harness {
    const get = vi.fn().mockImplementation((path: string) => {
        if (path === '/media/parent-1/derivatives/options') {
            return Promise.resolve(opts?.options ?? [])
        }
        return Promise.reject(new Error(`Unexpected GET ${path}`))
    })
    const post = vi.fn().mockImplementation((path: string) => {
        if (path === '/media/parent-1/derivatives') {
            if (opts?.producedAsset instanceof Error) {
                return Promise.reject(opts.producedAsset)
            }
            if (opts?.producedAsset !== undefined) {
                return Promise.resolve({ derivative: opts.producedAsset })
            }
            const derivative = baseAsset
            derivative.id = 'derivative-1'
            derivative.mime_type = 'application/pdf'
            return Promise.resolve({ derivative })
        }
        return Promise.reject(new Error(`Unexpected POST ${path}`))
    })
    const api = { get, post, postForm: vi.fn(), patch: vi.fn(), delete: vi.fn() }
    const hostContext: PluginHostContext = {
        api: api as unknown as PluginHostContext['api'],
        pinia: null,
        theme: 'light',
        route: null,
        router: null,
    }
    return { api, hostContext }
}

function mountStrip(asset: MediaAsset, harness: Harness) {
    return mount(VersionsStrip, {
        props: { asset, hostContext: harness.hostContext },
    })
}

beforeEach(() => {
    if (typeof HTMLDialogElement !== 'undefined') {
        // VersionsStrip doesn't open a dialog itself, but several
        // sibling tests already patch these prototypes; the global
        // make sure we don't double-patch in this suite.
    }
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('VersionsStrip', () => {
    it('renders one chip per derivative + a Source chip', async () => {
        const derivativeA = makeDerivative('pdf', 'derivative-a')
        const derivativeB = makeDerivative('png', 'derivative-b')
        const asset: MediaAsset = { ...baseAsset, derivatives: [derivativeA, derivativeB] }
        const harness = buildHost({ options: [] })
        const wrapper = mountStrip(asset, harness)
        await flushPromises()
        // Source + 2 derivative chips.
        expect(wrapper.find('[data-testid="versions-source"]').exists()).toBe(true)
        const chips = wrapper.findAll('[data-testid="versions-derivative-chip"]')
        expect(chips).toHaveLength(2)
        expect(chips[0]?.text()).toContain('PDF')
        expect(chips[1]?.text()).toContain('PNG')
        wrapper.unmount()
    })

    it('emits select with the derivative media_id when a chip is clicked', async () => {
        const derivative = makeDerivative('pdf', 'derivative-9')
        const asset: MediaAsset = { ...baseAsset, derivatives: [derivative] }
        const harness = buildHost({ options: [] })
        const wrapper = mountStrip(asset, harness)
        await flushPromises()
        const chip = wrapper.find('[data-testid="versions-derivative-chip"]')
        await chip.trigger('click')
        expect(wrapper.emitted('select')?.[0]?.[0]).toBe('derivative-9')
        wrapper.unmount()
    })

    it('lists every option returned by the options endpoint', async () => {
        const harness = buildHost({
            options: [
                { format: 'pdf', label: 'PDF', available: true },
                { format: 'png', label: 'PNG', available: true },
                { format: 'svg', label: 'SVG', available: true },
            ],
        })
        const wrapper = mountStrip({ ...baseAsset, derivatives: [] }, harness)
        await flushPromises()
        const options = wrapper.findAll('[data-testid="versions-convert-option"]')
        expect(options).toHaveLength(3)
        expect(options[0]?.text()).toBe('PDF')
        expect(options[1]?.text()).toBe('PNG')
        expect(options[2]?.text()).toBe('SVG')
        // All are available → none are disabled.
        const disabledCount = options.filter((o) => o.attributes('disabled') !== undefined).length
        expect(disabledCount).toBe(0)
        wrapper.unmount()
    })

    it('calls produce(format) and emits produced with the new derivative', async () => {
        const produced: MediaAsset = { ...baseAsset, id: 'derivative-fresh', mime_type: 'application/pdf' }
        const harness = buildHost({ options: [{ format: 'pdf', label: 'PDF', available: true }], producedAsset: produced })
        const wrapper = mountStrip({ ...baseAsset, derivatives: [] }, harness)
        await flushPromises()
        const select = wrapper.find('[data-testid="versions-convert-select"]')
        await select.setValue('pdf')
        await flushPromises()
        expect(harness.api.post).toHaveBeenCalledWith('/media/parent-1/derivatives', { format: 'pdf', options: {} })
        const emitted = wrapper.emitted('produced')
        expect(emitted).toBeDefined()
        expect(emitted?.[0]?.[0]).toMatchObject({ id: 'derivative-fresh' })
        wrapper.unmount()
    })

    it('disables format options whose available flag is false', async () => {
        const harness = buildHost({
            options: [
                { format: 'pdf', label: 'PDF', available: true },
                { format: 'jpeg', label: 'JPEG', available: false },
            ],
        })
        const wrapper = mountStrip({ ...baseAsset, derivatives: [] }, harness)
        await flushPromises()
        const options = wrapper.findAll('[data-testid="versions-convert-option"]')
        expect(options).toHaveLength(2)
        expect(options[0]?.attributes('disabled')).toBeUndefined()
        expect(options[1]?.attributes('disabled')).toBeDefined()
        // The dropdown still renders "Convert to…" even with no derivatives
        // — operators should always see what *would* be possible.
        expect(wrapper.find('[data-testid="versions-convert-select"]').exists()).toBe(true)
        wrapper.unmount()
    })
})
