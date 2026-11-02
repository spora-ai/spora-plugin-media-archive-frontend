<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Image, FileAudio, FileVideo, FileText, Folder } from 'lucide-vue-next'
import type { MediaAsset, MediaFolder } from '../types'
import { useShowTemporaryToggle } from '../composables/useShowTemporaryToggle'

const props = withDefaults(defineProps<{
    asset: MediaAsset
    /**
     * The folder the asset is filed in, resolved from the folder list.
     * `null` for an asset in the root — the card then shows no badge.
     */
    folder?: MediaFolder | null
    /**
     * Whether the card is a selection target. In selection mode a click
     * toggles the asset instead of opening its detail page.
     */
    selectable?: boolean
    /**
     * Whether the asset is selected.
     */
    selected?: boolean
}>(), {
    folder: null,
    selectable: false,
    selected: false,
})

const emit = defineEmits<{
    (event: 'select', asset: MediaAsset): void
    (event: 'upload-click'): void
    /**
     * The card is being dragged. The rail's folder rows are the drop
     * targets, so the panel can file the asset into one.
     */
    (event: 'drag-start', asset: MediaAsset): void
    (event: 'drag-end'): void
    /**
     * The card was clicked while the panel is in selection mode.
     */
    (event: 'toggle-select', asset: MediaAsset): void
}>()

const { t } = useI18n()

/**
 * The drag carries the asset's id, so a drop on a folder row knows what
 * it is filing. The data is also kept on the event, because a drop
 * outside the panel has to be able to say "nothing was filed".
 */
function onDragStart(event: DragEvent): void {
    if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', props.asset.id)
        event.dataTransfer.effectAllowed = 'move'
    }
    emit('drag-start', props.asset)
}

/**
 * A click opens the detail page — unless the panel is selecting, in
 * which case the same click adds or removes the asset from the
 * selection. One control, two jobs, chosen by the panel's mode.
 */
function onClick(): void {
    if (props.selectable) {
        emit('toggle-select', props.asset)
        return
    }
    emit('select', props.asset)
}

const isImage = computed(() => props.asset.media_type === 'image')
const isAudio = computed(() => props.asset.media_type === 'audio')
const isVideo = computed(() => props.asset.media_type === 'video')

/**
 * Show the corner "Temporary" badge iff the asset is on the purge
 * list AND the operator has flipped the "Include temporary files"
 * toggle on. When the toggle is off, the server filters temp rows
 * out so the badge never has anything to render — but the AND
 * keeps the check defensive in case the toggle ever desyncs from
 * the next /media call (rapid flips, races, etc.).
 */
const { showTemporary } = useShowTemporaryToggle()

const showTemporaryBadge = computed(() =>
    props.asset.is_temporary === true && showTemporary.value === true,
)

const createdAt = computed(() => {
    try {
        return new Date(props.asset.created_at).toLocaleString()
    } catch {
        return props.asset.created_at
    }
})

const sizeKb = computed(() => {
    if (props.asset.byte_size === null) return null
    if (props.asset.byte_size < 1024) return `${props.asset.byte_size} B`
    if (props.asset.byte_size < 1024 * 1024) return `${Math.round(props.asset.byte_size / 1024)} KB`
    return `${(props.asset.byte_size / 1024 / 1024).toFixed(1)} MB`
})

/**
 * One chip per distinct `format` already produced for this asset.
 * The card never deduplicates by `(format, producer)` — a Typst PDF
 * and an image-converter PDF render different bytes, and the operator
 * cares which is which. The detail page's `VersionsStrip` is where the
 * per-producer choice lives.
 */
interface DerivativeChip {
    format: string
    count: number
}

const derivativeChips = computed<ReadonlyArray<DerivativeChip>>(() => {
    const counts = new Map<string, number>()
    for (const d of props.asset.derivatives ?? []) {
        counts.set(d.format, (counts.get(d.format) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([format, count]) => ({
        format,
        count,
    }))
})
</script>

<template>
    <button
        type="button"
        :draggable="!selectable"
        class="group flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-card/80 focus:outline-none focus:ring-2 focus:ring-primary"
        :class="selected ? 'border-primary ring-2 ring-primary' : ''"
        :aria-pressed="selectable ? selected : undefined"
        :data-testid="`media-card-${asset.id}`"
        @click="onClick"
        @dragstart="onDragStart"
        @dragend="emit('drag-end')"
    >
        <div class="relative aspect-square overflow-hidden rounded-md bg-muted">
            <span
                v-if="showTemporaryBadge"
                class="pointer-events-none absolute right-2 top-2 z-10 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/20"
                data-testid="media-card-temporary-badge"
            >
                {{ t('Temporary') }}
            </span>
            <!--
              The selection mark. It is not a control of its own: the
              whole card is the toggle, and the mark only says what the
              card's state is.
            -->
            <span
                v-if="selectable"
                class="pointer-events-none absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border transition-colors"
                :class="selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background/80 text-transparent'"
                data-testid="media-card-selection"
            >
                <Check class="h-3.5 w-3.5" />
            </span>
            <img
                v-if="isImage"
                :src="asset.asset_url"
                :alt="asset.prompt ?? t('Archived')"
                class="h-full w-full object-contain bg-background"
                loading="lazy"
                draggable="false"
            />
            <div v-else class="flex h-full w-full items-center justify-center text-muted-foreground">
                <FileAudio v-if="isAudio" class="h-10 w-10" />
                <FileVideo v-else-if="isVideo" class="h-10 w-10" />
                <Image v-else-if="asset.media_type === 'image'" class="h-10 w-10" />
                <FileText v-else class="h-10 w-10" />
            </div>
        </div>
        <div class="flex items-start justify-between gap-2 text-xs">
            <div class="flex min-w-0 flex-col">
                <span class="truncate font-medium text-foreground" data-testid="media-card-filename">
                    {{ asset.filename ?? asset.id }}
                </span>
                <span
                    v-if="folder"
                    class="inline-flex w-fit items-center gap-1 text-muted-foreground"
                    data-testid="media-card-folder"
                >
                    <Folder class="h-3 w-3 shrink-0" />
                    <span class="truncate">{{ folder.name }}</span>
                </span>
                <span
                    v-if="asset.plugin_slug"
                    class="truncate text-muted-foreground"
                >
                    {{ asset.plugin_slug }}<span v-if="asset.tool_name"> · {{ asset.tool_name }}</span>
                </span>
                <span class="truncate text-muted-foreground">{{ createdAt }}</span>
            </div>
            <span v-if="sizeKb" class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{{ sizeKb }}</span>
        </div>
        <p v-if="asset.prompt" class="line-clamp-2 text-xs text-muted-foreground">
            {{ asset.prompt }}
        </p>
        <div
            v-if="derivativeChips.length > 0"
            class="flex flex-wrap gap-1"
            data-testid="media-card-derivatives"
        >
            <span
                v-for="chip in derivativeChips"
                :key="chip.format"
                class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                :data-format="chip.format"
                data-testid="media-card-derivative-chip"
            >
                {{ chip.format }}<span v-if="chip.count > 1">×{{ chip.count }}</span>
            </span>
        </div>
    </button>
</template>
