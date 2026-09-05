<script setup lang="ts">
import { computed } from 'vue'
import { Image, FileAudio, FileVideo, FileText } from 'lucide-vue-next'
import type { MediaAsset } from '../types'

const props = defineProps<{ asset: MediaAsset }>()

const isImage = computed(() => props.asset.media_type === 'image')
const isAudio = computed(() => props.asset.media_type === 'audio')
const isVideo = computed(() => props.asset.media_type === 'video')

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
 * cares which is which. The card opts for the simpler "one chip per
 * format" affordance; the detail page's `VersionsStrip` is where the
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
        class="group flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-card/80 focus:outline-none focus:ring-2 focus:ring-primary"
        :data-testid="`media-card-${asset.id}`"
    >
        <div class="relative aspect-square overflow-hidden rounded-md bg-muted">
            <img
                v-if="isImage"
                :src="asset.asset_url"
                :alt="asset.prompt ?? 'Archived'"
                class="h-full w-full object-contain bg-background"
                loading="lazy"
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
