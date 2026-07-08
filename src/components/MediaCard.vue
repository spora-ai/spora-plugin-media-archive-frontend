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
                :alt="asset.prompt ?? 'Archived image'"
                class="h-full w-full object-cover"
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
            <div class="flex flex-col">
                <span class="truncate font-medium text-foreground">
                    {{ asset.plugin_slug ?? 'unknown' }}<span v-if="asset.tool_name"> · {{ asset.tool_name }}</span>
                </span>
                <span class="truncate text-muted-foreground">{{ createdAt }}</span>
            </div>
            <span v-if="sizeKb" class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{{ sizeKb }}</span>
        </div>
        <p v-if="asset.prompt" class="line-clamp-2 text-xs text-muted-foreground">
            {{ asset.prompt }}
        </p>
    </button>
</template>