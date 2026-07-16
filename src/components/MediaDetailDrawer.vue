<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Copy, Download, ExternalLink, Eye, RefreshCw, Share2, Trash2, X } from 'lucide-vue-next'
import type { MediaAsset } from '../types'

const props = defineProps<{ asset: MediaAsset }>()
const emit = defineEmits<{
    (event: 'close'): void
    (event: 'updated', asset: MediaAsset): void
    (event: 'deleted', id: string): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const lightboxRef = ref<HTMLDialogElement | null>(null)

const createdAt = computed(() => {
    try {
        return new Date(props.asset.created_at).toLocaleString()
    } catch {
        return props.asset.created_at
    }
})

const downloadName = computed(() => {
    return props.asset.filename ?? `${props.asset.plugin_slug ?? 'media'}-${props.asset.id}.${props.asset.mime_type?.split('/')[1] ?? 'bin'}`
})

const isShared = computed(() => Boolean(props.asset.public_url))
const lightboxOpen = ref(false)
const toast = ref<string | null>(null)

const editingField = ref<string | null>(null)
const editValue = ref<string>('')
const savingField = ref(false)
const errorMessage = ref<string | null>(null)

function showToast(message: string): void {
    toast.value = message
    setTimeout(() => {
        if (toast.value === message) {
            toast.value = null
        }
    }, 2500)
}

async function copyToClipboard(value: string, label: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value)
        showToast(`${label} copied to clipboard`)
    } catch {
        showToast('Clipboard access denied')
    }
}

function onCancel(event: Event): void {
    event.preventDefault()
    emit('close')
}

function openLightbox(): void {
    if (props.asset.media_type === 'image' || props.asset.media_type === 'video') {
        lightboxOpen.value = true
    }
}

function closeLightbox(): void {
    lightboxOpen.value = false
}

watch(lightboxOpen, async (open) => {
    await nextTick()
    const dialog = lightboxRef.value
    if (open && dialog !== null && !dialog.open) {
        dialog.showModal()
    } else if (!open && dialog?.open) {
        dialog.close()
    }
})

async function toggleSharing(): Promise<void> {
    savingField.value = true
    errorMessage.value = null
    try {
        const host = props.asset.public_url
            ? null
            : 'enable'
        const updated = await fetch(`/media/${props.asset.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ public_access_enabled: host !== null }),
        }).then((r) => r.json())
        if (updated?.data) {
            emit('updated', updated.data as MediaAsset)
            showToast(host !== null ? 'Sharing enabled' : 'Sharing disabled')
        }
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : String(e)
    } finally {
        savingField.value = false
    }
}

async function refreshShareToken(): Promise<void> {
    savingField.value = true
    errorMessage.value = null
    try {
        const updated = await fetch(`/media/${props.asset.id}/public-token/refresh`, {
            method: 'POST',
            credentials: 'include',
        }).then((r) => r.json())
        if (updated?.data) {
            emit('updated', updated.data as MediaAsset)
            showToast('Public URL rotated')
        }
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : String(e)
    } finally {
        savingField.value = false
    }
}

function startEditing(field: string, current: string | null | undefined): void {
    editingField.value = field
    editValue.value = current ?? ''
}

async function saveField(field: 'filename' | 'prompt' | 'tags'): Promise<void> {
    savingField.value = true
    errorMessage.value = null
    try {
        const body: Record<string, unknown> = {}
        if (field === 'tags') {
            body.tags = editValue.value.split(',').map((t) => t.trim()).filter((t) => t !== '')
        } else {
            body[field] = editValue.value
        }
        const updated = await fetch(`/media/${props.asset.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
        }).then((r) => r.json())
        if (updated?.data) {
            emit('updated', updated.data as MediaAsset)
            editingField.value = null
            showToast(`${field} updated`)
        }
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : String(e)
    } finally {
        savingField.value = false
    }
}

async function deleteAsset(): Promise<void> {
    if (!confirm(`Delete ${props.asset.filename ?? 'this asset'}? This cannot be undone.`)) {
        return
    }
    try {
        await fetch(`/media/${props.asset.id}`, {
            method: 'DELETE',
            credentials: 'include',
        })
        emit('deleted', props.asset.id)
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : String(e)
    }
}

const tagsString = computed(() => (props.asset.tags ?? []).join(', '))

onMounted(() => {
    dialogRef.value?.showModal()
})

onBeforeUnmount(() => {
    if (dialogRef.value?.open) {
        dialogRef.value.close()
    }
    if (lightboxRef.value?.open) {
        lightboxRef.value.close()
    }
})
</script>

<template>
    <dialog
        ref="dialogRef"
        class="m-0 ml-auto h-full max-h-screen w-full max-w-2xl overflow-y-auto bg-background p-6 shadow-xl backdrop:bg-foreground/30"
        aria-label="Media detail"
        data-testid="media-drawer"
        @cancel="onCancel"
    >
        <header class="mb-4 flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">
                    {{ asset.media_type }}
                </p>
                <h3
                    v-if="editingField !== 'filename'"
                    class="cursor-pointer truncate text-base font-semibold hover:bg-muted/40 rounded px-1 -mx-1"
                    @click="startEditing('filename', asset.filename)"
                    :title="asset.filename ?? 'Click to set filename'"
                >
                    {{ asset.filename ?? 'Untitled' }}
                    <span class="text-xs font-normal text-muted-foreground">· click to rename</span>
                </h3>
                <form
                    v-else
                    class="flex items-center gap-2"
                    @submit.prevent="saveField('filename')"
                >
                    <label for="media-filename-input" class="sr-only">Filename</label>
                    <input
                        id="media-filename-input"
                        v-model="editValue"
                        class="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
                        autofocus
                        data-testid="filename-input"
                    />
                    <button
                        type="submit"
                        :disabled="savingField"
                        class="rounded bg-primary px-3 py-1 text-xs text-primary-foreground"
                    >
                        Save
                    </button>
                    <button
                        type="button"
                        @click="editingField = null"
                        class="rounded px-2 py-1 text-xs text-muted-foreground"
                    >
                        Cancel
                    </button>
                </form>
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

        <!-- Preview -->
        <figure
            v-if="asset.media_type === 'image'"
            class="group relative cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted"
            @click="openLightbox"
        >
            <img :src="asset.asset_url" :alt="asset.prompt ?? 'Archived'" class="h-auto w-full" />
            <div class="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-foreground/40 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                <span class="inline-flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs font-medium text-foreground">
                    <Eye class="h-3.5 w-3.5" /> Click to zoom
                </span>
            </div>
        </figure>
        <video
            v-else-if="asset.media_type === 'video'"
            controls
            class="w-full cursor-zoom-in rounded-lg border border-border"
            :src="asset.asset_url"
            data-testid="media-drawer-video"
            @click="openLightbox"
        >
            <track
                kind="captions"
                src="data:text/vtt,WEBVTT%0A%0A"
                srclang="en"
                label="No captions available"
                default
            />
        </video>
        <audio
            v-else-if="asset.media_type === 'audio'"
            controls
            class="w-full"
            :src="asset.asset_url"
            data-testid="media-drawer-audio"
        />
        <div
            v-else
            class="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground"
        >
            Preview unavailable for {{ asset.media_type }}
        </div>

        <!-- Primary actions -->
        <div class="mt-4 flex flex-wrap gap-2">
            <a
                :href="asset.asset_url"
                :download="downloadName"
                class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                data-testid="media-drawer-download"
            >
                <Download class="h-4 w-4" />
                Download
            </a>
            <button
                type="button"
                @click="copyToClipboard(asset.id, 'UUID')"
                class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                data-testid="copy-uuid"
            >
                <Copy class="h-3.5 w-3.5" />
                Copy UUID
            </button>
            <button
                type="button"
                @click="copyToClipboard(asset.filename ?? asset.id, 'Filename')"
                class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                data-testid="copy-filename"
            >
                <Copy class="h-3.5 w-3.5" />
                Copy filename
            </button>
        </div>

        <!-- Public sharing -->
        <section class="mt-6 rounded-lg border border-border bg-muted/30 p-4">
            <div class="flex items-center justify-between">
                <h4 class="flex items-center gap-1.5 text-sm font-semibold">
                    <Share2 class="h-4 w-4" />
                    Public sharing
                </h4>
                <label class="inline-flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        :checked="isShared"
                        :disabled="savingField"
                        data-testid="public-sharing-toggle"
                        @change="toggleSharing"
                    />
                    {{ isShared ? 'Enabled' : 'Disabled' }}
                </label>
            </div>
            <template v-if="isShared">
                <div class="mt-3 rounded border border-border bg-background p-2 font-mono text-xs break-all">
                    {{ asset.public_url }}
                </div>
                <div class="mt-2 flex flex-wrap gap-2">
                    <button
                        type="button"
                        @click="copyToClipboard(asset.public_url ?? '', 'Public URL')"
                        class="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                    >
                        <Copy class="h-3 w-3" /> Copy URL
                    </button>
                    <button
                        type="button"
                        @click="refreshShareToken"
                        :disabled="savingField"
                        class="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        <RefreshCw class="h-3 w-3" /> Refresh token
                    </button>
                </div>
            </template>
            <p v-else class="mt-2 text-xs text-muted-foreground">
                When enabled, anyone with the URL can fetch the file (no auth required).
            </p>
        </section>

        <!-- Metadata -->
        <dl class="mt-6 grid grid-cols-3 gap-2 text-xs">
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

            <dt class="text-muted-foreground">Tags</dt>
            <dd v-if="editingField !== 'tags'" class="col-span-2">
                <button
                    type="button"
                    @click="startEditing('tags', tagsString)"
                    class="cursor-pointer rounded px-1 -mx-1 text-left hover:bg-muted/40 w-full"
                    :title="'Click to edit tags'"
                >
                    <span v-if="tagsString">{{ tagsString }}</span>
                    <span v-else class="italic text-muted-foreground">click to add tags</span>
                </button>
            </dd>
            <dd v-else class="col-span-2">
                <form class="flex gap-1" @submit.prevent="saveField('tags')">
                    <label for="media-tags-input" class="sr-only">Tags</label>
                    <input
                        id="media-tags-input"
                        v-model="editValue"
                        class="flex-1 rounded border border-border bg-background px-2 py-1"
                        placeholder="tag1, tag2, tag3"
                    />
                    <button type="submit" class="rounded bg-primary px-2 text-xs text-primary-foreground">Save</button>
                </form>
            </dd>

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
                        class="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                        {{ asset.source_url }}
                        <ExternalLink class="h-3 w-3" />
                    </a>
                </dd>
            </template>
        </dl>

        <!-- Prompt -->
        <section class="mt-6">
            <h4 class="mb-2 text-sm font-semibold">Prompt</h4>
            <p
                v-if="editingField !== 'prompt'"
                class="cursor-pointer rounded-md bg-muted/60 p-3 text-sm text-foreground hover:bg-muted"
                @click="startEditing('prompt', asset.prompt)"
            >
                {{ asset.prompt ?? '(no prompt — click to add)' }}
            </p>
            <form v-else class="flex flex-col gap-2" @submit.prevent="saveField('prompt')">
                <label for="media-prompt-input" class="sr-only">Prompt</label>
                <textarea
                    id="media-prompt-input"
                    v-model="editValue"
                    class="min-h-[80px] rounded border border-border bg-background p-2 text-sm"
                ></textarea>
                <div class="flex justify-end gap-2">
                    <button type="button" @click="editingField = null" class="rounded px-3 py-1 text-xs text-muted-foreground">Cancel</button>
                    <button type="submit" class="rounded bg-primary px-3 py-1 text-xs text-primary-foreground">Save</button>
                </div>
            </form>
        </section>

        <!-- Danger zone -->
        <section class="mt-8 border-t border-destructive/30 pt-4">
            <button
                type="button"
                @click="deleteAsset"
                class="inline-flex items-center gap-1.5 rounded border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                data-testid="media-drawer-delete"
            >
                <Trash2 class="h-3.5 w-3.5" />
                Delete asset
            </button>
        </section>

        <p v-if="errorMessage" class="mt-3 rounded bg-destructive/10 p-2 text-xs text-destructive">{{ errorMessage }}</p>
    </dialog>

    <dialog
        v-if="lightboxOpen && (asset.media_type === 'image' || asset.media_type === 'video')"
        ref="lightboxRef"
        class="fixed inset-0 z-50 m-0 flex h-full w-full max-w-none items-center justify-center bg-foreground/80 p-4 backdrop:bg-foreground/80"
        aria-label="Media preview"
        data-testid="media-lightbox"
        @cancel.prevent="closeLightbox"
        @close="closeLightbox"
        @click.self="closeLightbox"
    >
        <button
            type="button"
            class="absolute right-4 top-4 rounded-full bg-background/90 p-2 text-foreground shadow"
            aria-label="Close lightbox"
            @click="closeLightbox"
        >
            <X class="h-5 w-5" />
        </button>
        <img
            v-if="asset.media_type === 'image'"
            :src="asset.asset_url"
            :alt="asset.prompt ?? 'Archived'"
            class="max-h-[90vh] max-w-[90vw] rounded object-contain shadow-2xl"
        />
        <video
            v-else
            controls
            autoplay
            :src="asset.asset_url"
            class="max-h-[90vh] max-w-[90vw] rounded shadow-2xl"
        >
            <track
                kind="captions"
                src="data:text/vtt,WEBVTT%0A%0A"
                srclang="en"
                label="No captions available"
                default
            />
        </video>
    </dialog>

    <!-- Toast -->
    <output
        v-if="toast"
        class="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg"
        data-testid="media-toast"
    >
        {{ toast }}
    </output>
</template>