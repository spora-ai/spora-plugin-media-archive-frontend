<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
    ArrowLeft,
    Copy,
    Download,
    ExternalLink,
    Eye,
    RefreshCw,
    Share2,
    Trash2,
    X,
} from 'lucide-vue-next'
import type { MediaAsset } from '../types'
import type { PluginHostContext } from '../shims'
import { MdEditor, MdPreview, type ToolbarNames } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

/**
 * Toolbar buttons rendered on the markdown editor. Mirrors the host SPA's
 * `MarkdownEditor.vue` `full` mode so operators get the same muscle memory
 * across the chat composer and this detail page. Deliberately omits
 * `github` (third-party branding in the toolbar), `mermaid` (we don't ship
 * diagrams in extracted docs), and `formula` (we don't ship LaTeX in
 * extracted docs).
 */
const markdownEditorToolbars: ToolbarNames[] = [
    'bold', 'underline', 'italic', 'strikeThrough',
    '-',
    'title', 'sub', 'sup', 'quote',
    '-',
    'unorderedList', 'orderedList', 'task',
    '-',
    'code', 'codeRow', 'link', 'image', 'table',
    '-',
    'preview',
    'pageFullscreen',
]

/**
 * Locale for the editor + preview UI. `md-editor-v3` ships Chinese as the
 * default; pin to en-US so the toolbar labels and screen-reader text are
 * consistent with the rest of the admin UI.
 */
const MARKDOWN_LOCALE = 'en-US'

const props = defineProps<{
    assetId: string
    hostContext: PluginHostContext
}>()

const emit = defineEmits<{
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

const asset = ref<MediaAsset | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const lightboxRef = ref<HTMLDialogElement | null>(null)
const deleteDialogRef = ref<HTMLDialogElement | null>(null)
const lightboxOpen = ref(false)
const toast = ref<string | null>(null)

const editingField = ref<string | null>(null)
const editValue = ref<string>('')
const savingField = ref<string | null>(null)

async function loadAsset(): Promise<void> {
    loading.value = true
    errorMessage.value = null
    try {
        const fetched = await api.value.get<MediaAsset>(`/media/${props.assetId}`)
        asset.value = fetched
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : String(e)
    } finally {
        loading.value = false
    }
}

const createdAt = computed(() => {
    if (asset.value === null) return ''
    try {
        return new Date(asset.value.created_at).toLocaleString()
    } catch {
        return asset.value.created_at
    }
})

const downloadName = computed(() => {
    if (asset.value === null) return 'media'
    return asset.value.filename
        ?? `${asset.value.plugin_slug ?? 'media'}-${asset.value.id}.${asset.value.mime_type?.split('/')[1] ?? 'bin'}`
})

const isShared = computed(() => asset.value !== null && Boolean(asset.value.public_url))

const tagsString = computed(() => (asset.value?.tags ?? []).join(', '))

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

function goBack(): void {
    const router = props.hostContext.router
    if (router !== null) {
        void router.push('/apps/media-archive')
    }
}

function openLightbox(): void {
    if (asset.value === null) return
    if (asset.value.media_type === 'image' || asset.value.media_type === 'video') {
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

function startEditing(field: string, current: string | null | undefined): void {
    editingField.value = field
    editValue.value = current ?? ''
}

function cancelEdit(): void {
    editingField.value = null
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

function dispatchMutation(client: PluginHostContext['api'], options: MutationOptions): Promise<MediaAsset> {
    if (options.verb === 'patch') {
        return client.patch<MediaAsset>(options.path, options.body)
    }
    if (options.verb === 'post') {
        return client.post<MediaAsset>(options.path, options.body)
    }
    return client.delete<MediaAsset>(options.path)
}

async function mutate(options: MutationOptions): Promise<MutationResult | null> {
    if (savingField.value !== null || asset.value === null) return null
    savingField.value = options.field
    errorMessage.value = null
    try {
        const client = api.value
        const verb = options.verb
        const updated = await dispatchMutation(client, options)
        if (verb === 'delete') {
            if (options.successToast) showToast(options.successToast)
            return {}
        }
        if (updated) {
            asset.value = updated
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

async function toggleSharing(): Promise<void> {
    if (asset.value === null) return
    const willEnable = asset.value.public_url === null || asset.value.public_url === undefined
    const result = await mutate({
        field: 'sharing',
        verb: 'patch',
        path: `/media/${asset.value.id}`,
        body: { public_access_enabled: willEnable },
        successToast: willEnable ? 'Sharing enabled' : 'Sharing disabled',
    })
    if (result?.updated) {
        emit('updated', result.updated)
    }
}

async function refreshShareToken(): Promise<void> {
    if (asset.value === null) return
    const result = await mutate({
        field: 'sharing',
        verb: 'post',
        path: `/media/${asset.value.id}/public-token/refresh`,
        body: undefined,
        successToast: 'Public URL rotated',
    })
    if (result?.updated) {
        emit('updated', result.updated)
    }
}

async function saveField(field: 'filename' | 'prompt' | 'tags' | 'markdown'): Promise<void> {
    if (asset.value === null) return
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
    } else if (field === 'markdown') {
        // `editValue` tracks the editor buffer; persist verbatim. Empty string
        // clears the field on the server — useful for re-running the
        // extraction pipeline manually later.
        body = { markdown_content: editValue.value }
    } else {
        body = { prompt: editValue.value }
    }
    const result = await mutate({
        field,
        verb: 'patch',
        path: `/media/${asset.value.id}`,
        body,
        successToast: `${field} updated`,
    })
    if (result?.updated) {
        emit('updated', result.updated)
        editingField.value = null
    }
}

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
    if (asset.value === null) return
    const result = await mutate({
        field: 'delete',
        verb: 'delete',
        path: `/media/${asset.value.id}`,
        successToast: 'Asset deleted',
    })
    if (result !== null) {
        emit('deleted', asset.value.id)
    }
}

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
    void loadAsset()
})

watch(() => props.assetId, () => {
    void loadAsset()
})

onBeforeUnmount(() => {
    if (lightboxRef.value?.open) {
        lightboxRef.value.close()
    }
})
</script>

<template>
    <div class="flex flex-col gap-6 text-foreground" data-testid="media-detail-page">
        <header class="flex flex-col gap-2">
            <button
                type="button"
                class="inline-flex w-fit items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                data-testid="media-detail-back"
                @click="goBack"
            >
                <ArrowLeft class="h-3.5 w-3.5" />
                Back to Media Archive
            </button>
            <div v-if="loading" class="text-sm text-muted-foreground">Loading asset…</div>
            <div v-else-if="errorMessage" class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load asset: {{ errorMessage }}
            </div>
            <template v-else-if="asset">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">
                    {{ asset.media_type }}
                </p>
                <h2
                    v-if="editingField !== 'filename'"
                    class="cursor-pointer truncate text-xl font-semibold hover:bg-muted/40 rounded px-1 -mx-1"
                    :title="asset.filename ?? 'Click to set filename'"
                    data-testid="media-detail-filename"
                    @click="startEditing('filename', asset.filename)"
                >
                    {{ asset.filename ?? 'Untitled' }}
                    <span class="ml-2 text-xs font-normal text-muted-foreground">· click to rename</span>
                </h2>
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
            </template>
        </header>

        <template v-if="asset">
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
                data-testid="media-page-video"
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
                data-testid="media-page-audio"
            />
            <div
                v-else
                class="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground"
            >
                Preview unavailable for {{ asset.media_type }}
            </div>

            <!-- Primary actions -->
            <div class="flex flex-wrap gap-2">
                <a
                    :href="asset.asset_url"
                    :download="downloadName"
                    class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    data-testid="media-page-download"
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
            <section class="rounded-lg border border-border bg-muted/30 p-4">
                <div class="flex items-center justify-between">
                    <h3 class="flex items-center gap-1.5 text-sm font-semibold">
                        <Share2 class="h-4 w-4" />
                        Public sharing
                    </h3>
                    <label class="inline-flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            :checked="isShared"
                            :disabled="savingField !== null"
                            data-testid="public-sharing-toggle"
                            @change="toggleSharing"
                        />
                        <output aria-live="polite" data-testid="sharing-status">
                            {{ isShared ? 'Enabled' : 'Disabled' }}
                        </output>
                    </label>
                </div>
                <template v-if="isShared">
                    <div class="mt-3 rounded border border-border bg-background p-2 font-mono text-xs break-all">
                        {{ asset.public_url }}
                    </div>
                    <!--
                        The backend (spora-core#137 → PublicMediaController::show) emits
                        `Referrer-Policy: no-referrer` so the ?token=… query never leaks
                        to third-party assets via Referer.
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
            <dl class="grid grid-cols-3 gap-2 text-xs">
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
                    <dd class="col-span-2 text-foreground">{{ asset.duration_seconds?.toFixed(2) }}s</dd>
                </template>

                <template v-if="asset.byte_size !== null">
                    <dt class="text-muted-foreground">Size</dt>
                    <dd class="col-span-2 text-foreground">{{ asset.byte_size }} bytes</dd>
                </template>

                <dt class="text-muted-foreground">Storage</dt>
                <dd class="col-span-2 text-foreground">{{ asset.storage_mode }}</dd>

                <template v-if="asset.has_markdown">
                    <dt class="text-muted-foreground">Markdown</dt>
                    <dd class="col-span-2 text-foreground">
                        <span class="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Extracted
                        </span>
                    </dd>
                </template>

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
            <section>
                <h3 class="mb-2 text-sm font-semibold">Prompt</h3>
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

            <!-- Markdown -->
            <section>
                <div class="mb-2 flex items-center justify-between">
                    <h3 class="text-sm font-semibold">Markdown</h3>
                    <div
                        v-if="editingField !== 'markdown' && asset.markdown_content !== null"
                        class="flex items-center gap-2"
                    >
                        <button
                            type="button"
                            class="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                            data-testid="markdown-edit-button"
                            @click="startEditing('markdown', asset.markdown_content)"
                        >
                            Edit
                        </button>
                    </div>
                </div>
                <div
                    v-if="editingField !== 'markdown' && asset.markdown_content !== null"
                    class="rounded-md border border-border bg-background p-3 max-h-96 overflow-auto"
                    data-testid="markdown-preview-wrapper"
                >
                    <MdPreview
                        :model-value="asset.markdown_content"
                        :language="MARKDOWN_LOCALE"
                        class="bg-transparent"
                        data-testid="markdown-preview"
                    />
                </div>
                <p
                    v-else-if="editingField !== 'markdown'"
                    class="rounded-md bg-muted/60 p-3 text-sm italic text-muted-foreground"
                    data-testid="markdown-empty"
                >
                    No extracted markdown yet.
                    <button
                        type="button"
                        class="ml-2 not-italic text-primary underline-offset-2 hover:underline"
                        data-testid="markdown-add-button"
                        @click="startEditing('markdown', '')"
                    >
                        Add markdown
                    </button>
                </p>
                <form
                    v-else
                    class="flex flex-col gap-2"
                    data-testid="markdown-edit-form"
                    @submit.prevent="saveField('markdown')"
                >
                    <label for="media-markdown-input" class="sr-only">Markdown content</label>
                    <MdEditor
                        id="media-markdown-input"
                        :model-value="editValue"
                        :rows="12"
                        :preview="true"
                        :language="MARKDOWN_LOCALE"
                        :toolbars="markdownEditorToolbars"
                        data-testid="markdown-editor"
                        @update:model-value="editValue = $event"
                    />
                    <div class="flex justify-end gap-2">
                        <button
                            type="button"
                            class="rounded px-3 py-1 text-xs text-muted-foreground"
                            data-testid="markdown-cancel"
                            @click="cancelEdit"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            :disabled="savingField !== null"
                            class="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                            data-testid="markdown-save"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </section>

            <!-- Danger zone -->
            <section class="border-t border-destructive/30 pt-4">
                <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    data-testid="media-page-delete"
                    @click="openDeleteDialog"
                >
                    <Trash2 class="h-3.5 w-3.5" />
                    Delete asset
                </button>
            </section>

            <p v-if="errorMessage" class="rounded bg-destructive/10 p-2 text-xs text-destructive">{{ errorMessage }}</p>
        </template>

        <!-- Lightbox dialog -->
        <dialog
            v-if="lightboxOpen && asset && (asset.media_type === 'image' || asset.media_type === 'video')"
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

        <!-- Delete confirm dialog -->
        <dialog
            v-if="asset"
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
            class="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg"
            data-testid="media-toast"
        >
            {{ toast }}
        </output>
    </div>
</template>