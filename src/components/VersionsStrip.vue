<script setup lang="ts">
/**
 * VersionsStrip — a plugin-agnostic affordance that surfaces every
 * derivative registered against the current source asset and exposes
 * a "Convert to…" dropdown for producing a new one.
 *
 * The component is intentionally generic: it imports no plugin
 * (Typst, image converter, etc.) and never references a producer by
 * name. Any `MediaDerivativeProducerInterface` registered in core is
 * reflected in the dropdown; the chip row mirrors what the controller
 * already returned on the source asset.
 *
 * Behaviour:
 *  - One chip per pre-baked derivative (the source row is always
 *    first; rendered as the "active" chip while the user hasn't
 *    picked a derivative).
 *  - Each chip click emits `select` with the chosen derivative's
 *    `media_id` (the source emits the parent asset id).
 *  - The dropdown lists every option the core
 *    `/media/{id}/derivatives/options` endpoint returned;
 *    unavailable options are disabled.
 *  - Selecting an available option calls `produce()` via the
 *    `useMediaDerivatives` composable and emits `produced` with the
 *    new/refreshed derivative asset so the parent can splice it into
 *    `asset.derivatives`.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Plus } from 'lucide-vue-next'
import type { MediaAsset } from '../types'
import type { PluginHostContext } from '../shims'
import {
    useMediaDerivatives,
    type DerivativeOption,
} from '../composables/useMediaDerivatives'

interface Props {
    asset: MediaAsset
    hostContext: PluginHostContext
    /**
     * Parent-owned active-derivative id. When `'source'` (or undefined)
     * the Source chip is the active one; any other id matches the
     * `media_id` of the corresponding derivative chip. The strip mirrors
     * this so the parent can drive both the preview and the chip
     * highlight from a single piece of state without prop drilling.
     */
    selectedDerivativeId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
    (event: 'select', mediaId: string): void
    (event: 'produced', derivative: MediaAsset): void
}>()

const mediaId = computed(() => props.asset.id)
const { options, produce } = useMediaDerivatives(props.hostContext, mediaId)

const optionList = ref<DerivativeOption[]>([])
const loadingOptions = ref(false)
const converting = ref<string | null>(null)
const convertError = ref<string | null>(null)

/**
 * The chip row's active highlight. Defaults to the source asset's id
 * (the "Source" chip) and tracks the parent-owned
 * `selectedDerivativeId` so the strip mirrors the preview pane without
 * its own duplicate state. When the parent resets the prop back to
 * `'source'` (after a successful "Convert to" splice, or a navigation
 * away to a different detail page), the Source chip lights up again.
 */
const selectedDerivativeId = computed<string>(
    () => props.selectedDerivativeId ?? props.asset.id,
)

function isSource(id: string): boolean {
    return id === props.asset.id
}

async function refreshOptions(): Promise<void> {
    loadingOptions.value = true
    try {
        optionList.value = await options()
    } catch {
        // Leave the dropdown empty; the strip still renders the
        // existing derivatives. A red banner would be noisy for what
        // is essentially a discoverability hint.
        optionList.value = []
    } finally {
        loadingOptions.value = false
    }
}

watch(() => props.asset.id, () => {
    optionList.value = []
    void refreshOptions()
})

onMounted(() => {
    void refreshOptions()
})

function chipLabel(derivative: { format: string, label?: string }): string {
    // Server-supplied chip label wins; the upper-case format slug is
    // the universal fallback for older spora-core versions and for
    // producers outside the ImageDerivativeFormat catalogue.
    return derivative.label !== undefined && derivative.label !== ''
        ? derivative.label
        : derivative.format.toUpperCase()
}

function onChipClick(derivativeId: string): void {
    // Parent owns `selectedDerivativeId` so the strip can mirror the
    // preview pane without duplicate state. Just forward the click —
    // `MediaDetailPage.vue`'s `onDerivativeSelected` decides what the
    // id maps to (source row → `'source'`, derivative row → media_id).
    emit('select', derivativeId)
}

function onConvertChange(event: Event): void {
    const target = event.target as HTMLSelectElement
    const value = target.value
    if (value === '') return
    void convertTo(value)
    target.value = ''
}

async function convertTo(format: string): Promise<void> {
    converting.value = format
    convertError.value = null
    try {
        const derivative = await produce(format)
        emit('produced', derivative)
        await refreshOptions()
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        convertError.value = message
    } finally {
        converting.value = null
    }
}
</script>

<template>
    <section
        class="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
        data-testid="versions-strip"
    >
        <div class="flex flex-wrap items-center gap-2" data-testid="versions-chips">
            <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                :class="
                    isSource(selectedDerivativeId)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                "
                data-testid="versions-source"
                @click="onChipClick(asset.id)"
            >
                Source
            </button>
            <button
                v-for="derivative in asset.derivatives"
                :key="derivative.media_id"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                :class="
                    selectedDerivativeId === derivative.media_id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                "
                :data-format="derivative.format"
                :title="`${derivative.format} — click to preview`"
                data-testid="versions-derivative-chip"
                @click="onChipClick(derivative.media_id)"
            >
                {{ chipLabel(derivative) }}
            </button>
        </div>

        <div class="flex items-center gap-2" data-testid="versions-convert-row">
            <Plus class="h-3.5 w-3.5 text-muted-foreground" />
            <label for="versions-convert-select" class="text-xs text-muted-foreground">
                Convert to
            </label>
            <select
                id="versions-convert-select"
                class="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                :disabled="loadingOptions || converting !== null"
                data-testid="versions-convert-select"
                @change="onConvertChange"
            >
                <option value="">
                    {{ loadingOptions ? 'Loading…' : 'Select a format' }}
                </option>
                <option
                    v-for="opt in optionList"
                    :key="opt.format"
                    :value="opt.format"
                    :disabled="!opt.available"
                    data-testid="versions-convert-option"
                >
                    {{ opt.label }}{{ opt.available ? '' : ' (unavailable)' }}
                </option>
            </select>
            <span
                v-if="converting"
                class="text-xs text-muted-foreground"
                data-testid="versions-converting"
            >
                Rendering {{ converting }}…
            </span>
        </div>

        <p
            v-if="convertError"
            class="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
            data-testid="versions-error"
        >
            {{ convertError }}
        </p>
    </section>
</template>
