<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, X } from 'lucide-vue-next'
import type { MediaAsset } from '../types'

const props = defineProps<{ asset: MediaAsset }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const dialogRef = ref<HTMLDialogElement | null>(null)

const createdAt = computed(() => {
    try {
        return new Date(props.asset.created_at).toLocaleString()
    } catch {
        return props.asset.created_at
    }
})

const downloadName = computed(() => {
    const ext = props.asset.mime_type?.split('/')[1] ?? 'bin'
    const base = props.asset.plugin_slug ?? 'media'
    return `${base}-${props.asset.id}.${ext}`
})

function onCancel(event: Event): void {
    // Suppress <dialog>'s default close-on-Escape so the parent (which
    // owns the unmount) sees a Vue close event instead.
    event.preventDefault()
    emit('close')
}

onMounted(() => {
    dialogRef.value?.showModal()
})

onBeforeUnmount(() => {
    if (dialogRef.value?.open) {
        dialogRef.value.close()
    }
})
</script>

<template>
    <dialog
        ref="dialogRef"
        class="m-0 ml-auto h-full max-h-screen w-full max-w-md overflow-y-auto bg-background p-6 shadow-xl backdrop:bg-foreground/30"
        aria-label="Media detail"
        data-testid="media-drawer"
        @cancel="onCancel"
    >
        <header class="mb-4 flex items-start justify-between gap-3">
            <div class="min-w-0">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">
                    {{ asset.media_type }}
                </p>
                <h3 class="truncate text-base font-semibold">
                    {{ asset.plugin_slug ?? 'Unknown source' }}
                    <span v-if="asset.tool_name" class="text-muted-foreground">· {{ asset.tool_name }}</span>
                </h3>
            </div>
            <button
                type="button"
                class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close detail"
                data-testid="media-drawer-close"
                @click="emit('close')"
            >
                <X class="h-4 w-4" />
            </button>
        </header>

        <figure
            v-if="asset.media_type === 'image'"
            class="overflow-hidden rounded-lg border border-border bg-muted"
        >
            <img :src="asset.asset_url" :alt="asset.prompt ?? 'Archived'" class="h-auto w-full" />
        </figure>
        <audio
            v-else-if="asset.media_type === 'audio'"
            controls
            class="w-full"
            :src="asset.asset_url"
            data-testid="media-drawer-audio"
        />
        <video
            v-else-if="asset.media_type === 'video'"
            controls
            class="w-full rounded-lg border border-border"
            :src="asset.asset_url"
            data-testid="media-drawer-video"
        >
            <track kind="captions" srclang="en" label="No captions available" default />
        </video>
        <div
            v-else
            class="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground"
        >
            Preview unavailable for {{ asset.media_type }}
        </div>

        <a
            :href="asset.asset_url"
            :download="downloadName"
            class="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            data-testid="media-drawer-download"
        >
            <Download class="h-4 w-4" />
            Download
        </a>

        <dl class="mt-4 grid grid-cols-3 gap-2 text-xs">
            <dt class="text-muted-foreground">Created</dt>
            <dd class="col-span-2 text-foreground">{{ createdAt }}</dd>

            <dt class="text-muted-foreground">MIME</dt>
            <dd class="col-span-2 font-mono text-foreground">{{ asset.mime_type ?? 'unknown' }}</dd>

            <template v-if="asset.width !== null && asset.height !== null">
                <dt class="text-muted-foreground">Dimensions</dt>
                <dd class="col-span-2 text-foreground">{{ asset.width }} × {{ asset.height }}</dd>
            </template>

            <template v-if="asset.duration_seconds !== null">
                <dt class="text-muted-foreground">Duration</dt>
                <dd class="col-span-2 text-foreground">{{ asset.duration_seconds.toFixed(2) }}s</dd>
            </template>

            <template v-if="asset.byte_size !== null">
                <dt class="text-muted-foreground">Size</dt>
                <dd class="col-span-2 text-foreground">{{ asset.byte_size }} bytes</dd>
            </template>

            <dt class="text-muted-foreground">Storage</dt>
            <dd class="col-span-2 text-foreground">{{ asset.storage_mode }}</dd>

            <template v-if="asset.task_id">
                <dt class="text-muted-foreground">Task</dt>
                <dd class="col-span-2 font-mono text-foreground">{{ asset.task_id }}</dd>
            </template>

            <template v-if="asset.source_url">
                <dt class="text-muted-foreground">Source</dt>
                <dd class="col-span-2 break-all">
                    <a
                        :href="asset.source_url"
                        target="_blank"
                        rel="noopener"
                        class="text-primary underline-offset-2 hover:underline"
                    >
                        {{ asset.source_url }}
                    </a>
                </dd>
            </template>
        </dl>

        <p v-if="asset.prompt" class="mt-4 rounded-md bg-muted/60 p-3 text-sm text-foreground">
            {{ asset.prompt }}
        </p>
    </dialog>
</template>