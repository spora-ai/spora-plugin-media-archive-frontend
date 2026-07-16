<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Copy, Download, ExternalLink, Eye, RefreshCw, Share2, Trash2, X } from 'lucide-vue-next'
import type { MediaAsset } from '../types'
import type { PluginHostContext } from '../shims'

const props = defineProps<{
    asset: MediaAsset
    hostContext: PluginHostContext
}>()
const emit = defineEmits<{
    (event: 'close'): void
    (event: 'updated', asset: MediaAsset): void
    (event: 'deleted', id: string): void
}>()

/**
 * Mutations go through `hostContext.api` rather than raw `fetch()` so the
 * host client handles the `/api/v1` base, CSRF token, credentials, and
 * `{ data: T }` envelope unwrap. The client throws `ApiError` on non-2xx,
 * which is the success check we want — no need to inspect `.ok` ourselves.
 */
const api = computed(() => props.hostContext.api)

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
const savingField = ref<string | null>(null)
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
    const willEnable = props.asset.public_url === null || props.asset.public_url === undefined
    const result = await mutate({
        field: 'sharing',
        verb: 'patch',
        path: `/media/${props.asset.id}`,
        body: { public_access_enabled: willEnable },
        successToast: willEnable ? 'Sharing enabled' : 'Sharing disabled',
    })
    if (result?.updated) {
        emit('updated', result.updated)
    }
}

async function refreshShareToken(): Promise<void> {
    const result = await mutate({
        field: 'sharing',
        verb: 'post',
        path: `/media/${props.asset.id}/public-token/refresh`,
        body: undefined,
        successToast: 'Public URL rotated',
    })
    if (result?.updated) {
        emit('updated', result.updated)
    }
}

function startEditing(field: string, current: string | null | undefined): void {
    editingField.value = field
    editValue.value = current ?? ''
}

interface MutationOptions {
    field: string
    verb: 'patch' | 'post' | 'delete'
    path: string
    body?: unknown
    successToast?: string
}

interface MutationResult {
    updated?: MediaAsset
}

async function mutate(options: MutationOptions): Promise<MutationResult | null> {
    if (savingField.value !== null) return null
    savingField.value = options.field
    errorMessage.value = null
    try {
        const client = api.value
        const verb = options.verb
        const request = verb === 'patch'
            ? client.patch<MediaAsset>(options.path, options.body)
            : verb === 'post'
                ? client.post<MediaAsset>(options.path, options.body)
                : client.delete<MediaAsset>(options.path)
        const updated = await request
        if (verb === 'delete') {
            if (options.successToast) showToast(options.successToast)
            return {}
        }
        if (updated) {
            if (options.successToast) showToast(options.successToast)
            return { updated }
        }
        return {}
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : String(e)
        return null
    } finally {
        savingField.value = null
    }
}

async function saveField(field: 'filename' | 'prompt' | 'tags'): Promise<void> {
    let body: Record<string, unknown>
    if (field === 'filename') {
        const trimmed = editValue.value.trim()
        if (trimmed === '') {
            errorMessage.value = 'Filename cannot be empty'
            return
        }
        body = { filename: trimmed }
    } else if (field === 'tags') {
        body = {
            tags: editValue.value
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t !== ''),
        }
    } else {
        body = { prompt: editValue.value }
    }
    const result = await mutate({
        field,
        verb: 'patch',
        path: `/media/${props.asset.id}`,
        body,
        successToast: `${field} updated`,
    })
    if (result?.updated) {
        emit('updated', result.updated)
        editingField.value = null
    }
}

const deleteDialogRef = ref<HTMLDialogElement | null>(null)
const lightboxTriggerRef = ref<HTMLElement | null>(null)

function openDeleteDialog(): void {
    deleteDialogRef.value?.showModal()
}

function closeDeleteDialog(): void {
    if (deleteDialogRef.value?.open) {
        deleteDialogRef.value.close()
    }
}

async function confirmDelete(): Promise<void> {
    closeDeleteDialog()
    const result = await mutate({
        field: 'delete',
        verb: 'delete',
        path: `/media/${props.asset.id}`,
        successToast: 'Asset deleted',
    })
    if (result !== null) {
        emit('deleted', props.asset.id)
    }
}

function cancelEdit(): void {
    editingField.value = null
}

const tagsString = computed(() => (props.asset.tags ?? []).join(', '))

function safeExternalUrl(url: string | null | undefined): string | null {
    if (url === null || url === undefined) return null
    const trimmed = url.trim()
    if (trimmed === '') return null
    try {
        const parsed = new URL(trimmed)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString()
        }
        return null
    } catch {
        return null
    }
}

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
    if (lightboxTriggerRef.value !== null) {
        lightboxTriggerRef.value.focus()
        lightboxTriggerRef.value = null
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
                    :title="asset.filename ?? 'Click to set filename'"
                    @click="startEditing('filename', asset.filename)"
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
                        :disabled="savingField !== null"
                        class="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                    >
                        Save
                    </button>
                    <button
                        type="button"
                        class="rounded px-2 py-1 text-xs text-muted-foreground"
                        data-testid="filename-cancel"
                        @click="cancelEdit"
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
            data-testid="media-preview-figure"
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
            muted
            playsinline
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
                class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                data-testid="copy-uuid"
                @click="copyToClipboard(asset.id, 'UUID')"
            >
                <Copy class="h-3.5 w-3.5" />
                Copy UUID
            </button>
            <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                data-testid="copy-filename"
                @click="copyToClipboard(asset.filename ?? asset.id, 'Filename')"
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
                        :disabled="savingField !== null"
                        data-testid="public-sharing-toggle"
                        @change="toggleSharing"
                    />
                    <div role="status" aria-live="polite" data-testid="sharing-status">
                        {{ isShared ? 'Enabled' : 'Disabled' }}
                    </div>
                </label>
            </div>
            <template v-if="isShared">
                <div class="mt-3 rounded border border-border bg-background p-2 font-mono text-xs break-all">
                    {{ asset.public_url }}
                </div>
                <!--
                    The backend (spora-core#137 → PublicMediaController::show) emits
                    `Referrer-Policy: no-referrer` so the ?token=… query never leaks
                    to third-party assets via Referer. The host copy-URL handler is
                    a no-op once that header lands; this comment is the only place
                    the UI knows about it.
                -->
                <div class="mt-2 flex flex-wrap gap-2">
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                        data-testid="copy-public-url"
                        @click="copyToClipboard(asset.public_url ?? '', 'Public URL')"
                    >
                        <Copy class="h-3 w-3" /> Copy URL
                    </button>
                    <button
                        type="button"
                        :disabled="savingField !== null"
                        class="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                        data-testid="refresh-public-token"
                        @click="refreshShareToken"
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
                    class="cursor-pointer rounded px-1 -mx-1 text-left hover:bg-muted/40 w-full"
                    :title="'Click to edit tags'"
                    data-testid="tags-edit-button"
                    @click="startEditing('tags', tagsString)"
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
                    <button
                        type="submit"
                        :disabled="savingField !== null"
                        class="rounded bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50"
                        data-testid="tags-save"
                    >
                        Save
                    </button>
                    <button
                        type="button"
                        class="rounded px-2 text-xs text-muted-foreground"
                        data-testid="tags-cancel"
                        @click="cancelEdit"
                    >
                        Cancel
                    </button>
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
                        v-if="safeExternalUrl(asset.source_url) !== null"
                        :href="safeExternalUrl(asset.source_url) ?? undefined"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                        {{ asset.source_url }}
                        <ExternalLink class="h-3 w-3" />
                    </a>
                    <span v-else class="italic text-muted-foreground">Invalid source URL</span>
                </dd>
            </template>
        </dl>

        <!-- Prompt -->
        <section class="mt-6">
            <h4 class="mb-2 text-sm font-semibold">Prompt</h4>
            <p
                v-if="editingField !== 'prompt'"
                class="cursor-pointer rounded-md bg-muted/60 p-3 text-sm text-foreground hover:bg-muted"
                data-testid="prompt-edit-button"
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
                    <button
                        type="button"
                        class="rounded px-3 py-1 text-xs text-muted-foreground"
                        data-testid="prompt-cancel"
                        @click="cancelEdit"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        :disabled="savingField !== null"
                        class="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                        data-testid="prompt-save"
                    >
                        Save
                    </button>
                </div>
            </form>
        </section>

        <!-- Danger zone -->
        <section class="mt-8 border-t border-destructive/30 pt-4">
            <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                data-testid="media-drawer-delete"
                @click="openDeleteDialog"
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
        aria-modal="true"
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
            data-testid="lightbox-close"
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
            muted
            playsinline
            :src="asset.asset_url"
            class="max-h-[90vh] max-w-[90vw] rounded shadow-2xl"
            data-testid="lightbox-video"
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

    <dialog
        ref="deleteDialogRef"
        class="rounded-lg p-6 backdrop:bg-foreground/40"
        aria-labelledby="delete-title"
        aria-describedby="delete-desc"
        data-testid="delete-confirm-dialog"
        @cancel.prevent="closeDeleteDialog"
    >
        <h2 id="delete-title" class="text-base font-semibold">Delete asset?</h2>
        <p id="delete-desc" class="mt-2 text-sm text-muted-foreground">
            {{ asset.filename ?? 'This asset' }} will be permanently deleted. This cannot be undone.
        </p>
        <div class="mt-4 flex justify-end gap-2">
            <button
                type="button"
                class="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                data-testid="delete-cancel"
                @click="closeDeleteDialog"
            >
                Cancel
            </button>
            <button
                type="button"
                class="rounded bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                data-testid="delete-confirm"
                @click="confirmDelete"
            >
                Delete
            </button>
        </div>
    </dialog>

    <!-- Toast -->
    <output
        v-if="toast"
        aria-live="polite"
        role="status"
        class="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg"
        data-testid="media-toast"
    >
        {{ toast }}
    </output>
</template>
