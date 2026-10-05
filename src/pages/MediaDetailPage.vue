<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
    ArrowLeft,
    Copy,
    Download,
    ExternalLink,
    Eye,
    FileText,
    Pin,
    RefreshCw,
    Share2,
    Trash2,
    X,
} from 'lucide-vue-next'
import type { MediaAsset, MediaDerivative } from '../types'
import type { PluginHostContext } from '../shims'
import { MdPreview } from 'md-editor-v3'
// Global side-effect import, kept: `<MdPreview>` needs the markdown
// typography subset of this stylesheet (headings, lists, tables, code
// blocks). The editor chrome is dead weight we accept rather than
// reimplement a renderer.
import 'md-editor-v3/lib/style.css'
import VersionsStrip from '../components/VersionsStrip.vue'

/**
 * Locale for the markdown preview. `md-editor-v3` ships Chinese as the
 * default; pin to en-US so the rendered markup and screen-reader text
 * are consistent with the rest of the admin UI.
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

/**
 * The detail page renders the asset's source bytes by default, but
 * `VersionsStrip` lets the operator flip between source and any
 * derivative via a chip row. `selectedDerivativeId` tracks the
 * currently-prepped row — `'source'` (string literal) renders the
 * parent; any other id resolves through the derivatives array.
 *
 * Resetting to `'source'` whenever the asset id changes (router
 * navigation to a different detail page) keeps the strip from
 * carrying the previous page's selection across.
 */
const selectedDerivativeId = ref<string>('source')

/**
 * Selected derivative for the current selection, or `null` when the
 * source is being shown. Computed separately from the parent asset so
 * the preview pane can branch on whether a derivative is active.
 */
const selectedDerivative = computed<MediaDerivative | null>(() => {
    if (asset.value === null) return null
    if (selectedDerivativeId.value === 'source') return null
    return asset.value.derivatives.find(d => d.media_id === selectedDerivativeId.value)
        ?? null
})

/**
 * What the `<img :src>` and the lightbox render. Source by default,
 * derivative URL when a chip is active. Returns `null` while the asset
 * is still loading so the template can short-circuit the <img>.
 */
const previewSrc = computed<string | null>(() => {
    if (asset.value === null) return null
    return selectedDerivative.value !== null
        ? selectedDerivative.value.asset_url
        : asset.value.asset_url
})

const previewAlt = computed<string>(() => {
    if (asset.value === null) return 'Archived'
    const base = asset.value.prompt ?? asset.value.filename ?? 'Archived'
    return selectedDerivative.value !== null
        ? `${base} (derivative)`
        : base
})

/**
 * Definite height, not `max-h-*`: the img's percentage `max-h-full`
 * computes to `none` against an auto-height parent, so the image
 * overflows and `overflow-hidden` crops it.
 */
const previewSurfaceClass = 'flex h-[40vh] min-h-[220px] w-full lg:h-[70vh]'

const previewUnavailableLabel = computed<string>(() => {
    if (asset.value === null) return 'this file'
    return selectedDerivative.value !== null
        ? selectedDerivative.value.format
        : asset.value.media_type
})

type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'unsupported'

/**
 * What element to render in the preview pane. Branches on the
 * SELECTED derivative's format + mime_type when one is active, else on
 * the source asset's media_type + mime_type. The previous implementation
 * only branched on `asset.media_type`, which meant a `.typ` source
 * with a freshly-produced PDF derivative rendered the wrong branch —
 * the `<img>` only existed inside `v-if="media_type === 'image'"`,
 * so the chip click silently changed `selectedDerivativeId` without
 * updating the DOM. Now the chip click on any format swap lands on
 * an element that can render it (PDF → download card, raster → img,
 * text → fetched body).
 */
const previewKind = computed<PreviewKind>(() => {
    if (asset.value === null) return 'unsupported'
    const derivative = selectedDerivative.value
    if (derivative !== null) {
        return kindForFormat(derivative.format, derivative.mime_type ?? null)
    }
    return kindForMediaType(asset.value.media_type, asset.value.mime_type)
})

/**
 * Image-like derivative formats the browser can decode inline. The
 * concrete raster extension list is small; the core resize/convert
 * presets ship as `thumbnail-*`, `medium-*`, `format-*` (see
 * `ImageDerivativeFormat::FORMAT_PRESETS`) and all of those output
 * raster bytes, so we accept any `format-*|thumbnail-*|medium-*`
 * prefix as image too.
 */
const PDF_FORMATS = new Set(['pdf'])

const MARKDOWN_MIME_TYPES = new Set(['text/markdown', 'text/x-markdown'])

/**
 * Fallback for a core that predates `mime_type` on derivative rows
 * (`MediaAssetSerializer::buildDerivativeRows()` gained it in spora-core
 * #285). An `md` slug must still preview on an older server.
 */
const MARKDOWN_FORMATS = new Set(['md', 'markdown'])

/**
 * Is this (format, mime) pair markdown? The MIME wins when the server
 * sent one — `md` is a producer-chosen slug and could be HTML or binary.
 * The slug only decides the no-MIME case.
 */
function isMarkdown(format: string, mimeType: string | null): boolean {
    if (mimeType !== null && mimeType !== '') {
        return MARKDOWN_MIME_TYPES.has(mimeType.toLowerCase())
    }
    return MARKDOWN_FORMATS.has(format.toLowerCase())
}

function kindForFormat(format: string, mimeType: string | null): PreviewKind {
    const f = format.toLowerCase()
    if (PDF_FORMATS.has(f)) return 'pdf'
    if (isMarkdown(format, mimeType)) return 'text'
    if (mimeType !== null && mimeType.toLowerCase().startsWith('text/')) return 'text'
    if (f.startsWith('thumbnail-')) return 'image'
    if (f.startsWith('medium-')) return 'image'
    if (f.startsWith('format-')) return 'image'
    // Concrete raster extensions from any image producer (core's
    // ImageDerivativeFormat catalogue AND TypstRenderProducer's pdf/png/svg
    // output AND any future plugin that registers an image-format derivative).
    if (f === 'svg' || f === 'png' || f === 'jpg' || f === 'jpeg'
        || f === 'webp' || f === 'gif' || f === 'avif' || f === 'bmp') {
        return 'image'
    }
    return 'unsupported'
}

/**
 * Source-asset branch. The `media_type` enum doesn't carry enough
 * resolution for `document` (which can be PDF, JSON, CSV, plain
 * text, or `text/x-typst`), so we also read `mime_type`: anything
 * with a `text/*` prefix is treated as a text source so the source
 * chip renders the raw bytes in a `<pre>` block instead of the gray
 * "Preview unavailable for document" fallback.
 */
function kindForMediaType(mediaType: string, mimeType: string | null): PreviewKind {
    if (mediaType === 'image') return 'image'
    if (mediaType === 'video') return 'video'
    if (mediaType === 'audio') return 'audio'
    if (mediaType === 'document' && mimeType !== null && mimeType.startsWith('text/')) return 'text'
    return 'unsupported'
}

/**
 * Rendered markdown or verbatim? A markdown-ish MIME gets
 * `<MdPreview>`; every other text type keeps the raw `<pre>`, because
 * a verbatim dump is the honest rendering of e.g. a `.typ` source.
 */
const isMarkdownPreview = computed<boolean>(() => {
    const derivative = selectedDerivative.value
    if (derivative !== null) return isMarkdown(derivative.format, derivative.mime_type ?? null)
    return isMarkdown('', asset.value?.mime_type ?? null)
})

const lightboxRef = ref<HTMLDialogElement | null>(null)
const deleteDialogRef = ref<HTMLDialogElement | null>(null)
const lightboxOpen = ref(false)
const toast = ref<string | null>(null)

/**
 * Text-preview state. The bytes are fetched on demand (when the
 * operator lands on a text-kind selection — the Source chip of a
 * `text/*` asset, or an `md` / `text/*` derivative chip) rather than
 * eagerly on mount, so a detail page opened on a PDF or image pays
 * nothing.
 *
 * The fetch goes through the browser's native `fetch()` because the host
 * API client always parses responses as JSON; raw bytes need to bypass
 * that wrapper. The asset endpoint is authenticated via session cookie,
 * so `credentials: 'include'` is enough.
 */
const textSource = ref<string | null>(null)
const textSourceLoading = ref(false)
const textSourceError = ref<string | null>(null)

/**
 * Whose bytes the text pane shows: the lit chip's derivative, else the
 * source. Hardcoding `asset.asset_url` here fetched the PDF's bytes for
 * an `md` chip on a PDF and dumped them as mojibake in a `<pre>`.
 */
const selectedTextUrl = computed<string | null>(() => {
    if (asset.value === null) return null
    return selectedDerivative.value !== null
        ? selectedDerivative.value.asset_url
        : asset.value.asset_url
})

/**
 * Monotonic token for `loadTextSource` — guards against a stale fetch
 * resolving after the operator moved to a different asset or derivative
 * and overwriting the new selection's body. Bumped on every call to
 * invalidate every in-flight load; the `finally` is gated on the same
 * check so only the current request flips the spinner off — same
 * pattern as App.vue's `requestId`.
 */
let loadToken = 0

async function loadTextSource(): Promise<void> {
    const url = selectedTextUrl.value
    if (url === null || url === '') return
    const myToken = ++loadToken
    textSourceLoading.value = true
    textSourceError.value = null
    try {
        const response = await fetch(url, { credentials: 'include' })
        if (myToken !== loadToken) return
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`)
        }
        const body = await response.text()
        if (myToken !== loadToken) return
        textSource.value = body
    } catch (e) {
        if (myToken !== loadToken) return
        textSourceError.value = e instanceof Error ? e.message : String(e)
    } finally {
        if (myToken === loadToken) {
            textSourceLoading.value = false
        }
    }
}

/**
 * The `${assetId}|${url}` the pane last settled on, or `null` before the
 * first run. Not read off the watcher's `oldValue`: an `immediate` watch
 * passes Vue's `INITIAL_WATCHER_VALUE` sentinel, not `undefined`, so a
 * first-run test built on it would be a lie that happens to work.
 */
let loadedTextTarget: string | null = null

// Invalidate + (re)load in ONE watcher. As two watchers these depended on
// each other's flush order: the fetch watcher fired while `asset.value`
// still held the PREVIOUS asset, then the `textSource === null` guard
// refused the refetch once the new asset landed — a spinner nothing
// clears, and never a body.
watch(
    () => [props.assetId, selectedTextUrl.value, previewKind.value] as const,
    ([assetId, url, kind]) => {
        // Different asset or URL means different bytes: drop the cached
        // body and orphan any in-flight request. The token bump comes
        // BEFORE the refetch decision so a stale response can never slip
        // through, and the loading flag is reset here because the
        // abandoned request's gated `finally` can no longer clear it —
        // left set, the guard below would read "a load is already
        // running" and skip the refetch.
        const target = `${assetId}|${url ?? ''}`
        if (target !== loadedTextTarget) {
            loadedTextTarget = target
            loadToken++
            textSource.value = null
            textSourceLoading.value = false
            textSourceError.value = null
        }
        // `immediate` makes a deep-link to a text asset work without an
        // intermediate chip click; "fetch only when needed" comes from the
        // `kind === 'text'` gate, not from a non-immediate watch.
        if (kind !== 'text' || textSource.value !== null || textSourceLoading.value) return
        // `props.assetId` has moved on but `loadAsset()` has not resolved,
        // so the URL above is the one the operator is leaving.
        if (asset.value === null || asset.value.id !== assetId) return
        void loadTextSource()
    },
    { immediate: true },
)

const editingField = ref<string | null>(null)
const editValue = ref<string>('')
const savingField = ref<string | null>(null)

// Union: filename + tags use `<input>`, prompt uses `<textarea>`.
// `startEditing()` focuses + selects it on next tick so the operator
// can type without clicking twice.
const editingInput = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

async function loadAsset(): Promise<void> {
    loading.value = true
    errorMessage.value = null
    try {
        const fetched = await api.value.get<MediaAsset>(`/media/${props.assetId}`)
        asset.value = fetched
        selectedDerivativeId.value = 'source'
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : String(e)
    } finally {
        loading.value = false
    }
}

/**
 * Strip chip click → swap the preview to the chosen derivative.
 * VersionsStrip emits the derivative's `media_id` (the parent emits
 * its own id; we map that to the literal `'source'` so the source
 * chip also flips the preview back).
 */
function onDerivativeSelected(mediaId: string): void {
    if (asset.value !== null && mediaId === asset.value.id) {
        selectedDerivativeId.value = 'source'
        return
    }
    selectedDerivativeId.value = mediaId
}

const createdAt = computed(() => {
    if (asset.value === null) return ''
    try {
        return new Date(asset.value.created_at).toLocaleString()
    } catch {
        return asset.value.created_at
    }
})

// Download follows the versions strip: an active chip means the operator
// wants the converted file, not the parent.
const downloadSrc = computed<string>(() => previewSrc.value ?? '')

const downloadName = computed<string>(() => {
    if (asset.value === null) return 'media'
    const derivative = selectedDerivative.value
    if (derivative === null) {
        return asset.value.filename
            ?? `${asset.value.plugin_slug ?? 'media'}-${asset.value.id}.${asset.value.mime_type?.split('/')[1] ?? 'bin'}`
    }
    // Swap the extension, don't append: notes.pdf + png → notes.png.
    const stem = (asset.value.filename ?? `${asset.value.plugin_slug ?? 'media'}-${asset.value.id}`)
        .replace(/\.[^./\\]+$/, '')
    return `${stem}.${derivative.format !== '' ? derivative.format : 'bin'}`
})

// Names the selection so the operator can tell what Download will serve.
const downloadLabel = computed<string>(() => {
    const format = selectedDerivative.value?.format
    return format !== undefined && format !== ''
        ? `Download ${format.toUpperCase()} derivative`
        : 'Download'
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
    // Lightbox only makes sense for image/video — PDFs use the
    // download card directly. Image derivatives on a non-image source
    // (rare but possible) still open the lightbox via previewKind.
    if (previewKind.value === 'image' || previewKind.value === 'video') {
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

async function startEditing(field: string, current: string | null | undefined): Promise<void> {
    editingField.value = field
    editValue.value = current ?? ''
    // nextTick: v-if must commit before the input exists. select() so
    // the first keystroke replaces the whole value.
    await nextTick()
    editingInput.value?.focus()
    editingInput.value?.select()
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

async function saveField(field: 'filename' | 'prompt' | 'tags'): Promise<void> {
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

/**
 * "Keep file" action — spora-core PR #238. Promotes a temporary
 * asset off the purge queue so it sticks around past the auto-purge
 * horizon. Lives in its own state slot (`keepingAsset`) rather than
 * the shared `savingField` because it's an independent action, not a
 * field save — sharing the slot would make the field-save UI look
 * busy while the operator is editing the filename.
 */
const keepingAsset = ref(false)

async function keepAsset(): Promise<void> {
    if (asset.value === null || keepingAsset.value) return
    keepingAsset.value = true
    errorMessage.value = null
    try {
        await dispatchMutation(api.value, {
            field: 'keep',
            verb: 'post',
            path: `/media/${asset.value.id}/keep`,
        })
        showToast("File kept — won't be auto-purged.")
        await loadAsset()
    } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : String(e)
    } finally {
        keepingAsset.value = false
    }
}

/**
 * Splice a freshly-produced derivative into `asset.derivatives`. We
 * keep the locally-returned asset id + URL so the strip's chip row
 * updates immediately; a follow-up `loadAsset()` would also work,
 * but the local write is cheaper and avoids the race where a
 * concurrent PATCH clobbers the user's in-progress edits.
 */
function onDerivativeProduced(derivative: MediaAsset): void {
    if (asset.value === null) return
    const list = [...(asset.value.derivatives ?? [])]
    const summary: MediaDerivative = {
        format: extractFormat(derivative),
        media_id: derivative.id,
        asset_url: derivative.asset_url,
        // Mirror the server's row shape: the preview pane resolves the
        // text/markdown branch from this MIME, so a derivative whose
        // slug doesn't self-describe (a `text/csv` export) would show the
        // grey fallback until the next `loadAsset()`.
        mime_type: derivative.mime_type,
        producer_plugin: derivative.plugin_slug,
        producer_operation: derivative.tool_name,
        created_at: derivative.created_at,
    }
    const existingIndex = list.findIndex((d) => d.media_id === summary.media_id)
    if (existingIndex >= 0) {
        list.splice(existingIndex, 1, summary)
    } else {
        list.push(summary)
    }
    asset.value = { ...asset.value, derivatives: list }
}

/**
 * Best-effort "what format did this asset come back in?". The
 * controller's `produce()` returns a `MediaAsset` (the new
 * `media_assets` row), not the wire shape that lives inside the
 * parent's `derivatives[]`. The MIME is the cleanest source of truth;
 * it ends in `/pdf`, `/png`, etc.
 */
function extractFormat(derivative: MediaAsset): string {
    const mime = derivative.mime_type ?? ''
    const slash = mime.lastIndexOf('/')
    return slash >= 0 ? mime.slice(slash + 1).toLowerCase() : ''
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
                <button
                    v-if="editingField !== 'filename'"
                    type="button"
                    class="cursor-pointer truncate text-left text-xl font-semibold hover:bg-muted/40 rounded px-1 -mx-1"
                    :title="asset.filename ?? 'Click to set filename'"
                    data-testid="media-detail-filename"
                    @click="startEditing('filename', asset.filename)"
                    @keydown.enter.prevent="startEditing('filename', asset.filename)"
                    @keydown.space.prevent="startEditing('filename', asset.filename)"
                >
                    {{ asset.filename ?? 'Untitled' }}
                    <span class="ml-2 text-xs font-normal text-muted-foreground">· click to rename</span>
                </button>
                <form
                    v-else
                    class="flex items-center gap-2"
                    @submit.prevent="saveField('filename')"
                >
                    <label for="media-filename-input" class="sr-only">Filename</label>
                    <input
                        id="media-filename-input"
                        ref="editingInput"
                        v-model="editValue"
                        class="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
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
            <VersionsStrip
                :asset="asset"
                :host-context="hostContext"
                :selected-derivative-id="selectedDerivativeId"
                @select="onDerivativeSelected"
                @produced="onDerivativeProduced"
            />
            <!-- `items-start` is required for the sticky preview: a stretched grid
                 item is already as tall as its area. Equal columns — the figure is
                 height-capped, so portrait/square images are height-bound and a
                 wider preview column is dead space. Below `lg` it collapses to one
                 column, preserving the mobile order. -->
            <div
                class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                data-testid="media-detail-layout"
            >
                <!--
                    PDF derivatives get a download card, not an <iframe>: the
                    browser's built-in viewer hijacks the embed and downloads on
                    click.
                -->
                <div class="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4" data-testid="media-detail-preview-column">
                    <button
                        v-if="previewKind === 'image'"
                        type="button"
                        class="group relative items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-3"
                        :class="previewSurfaceClass"
                        aria-label="Open image in lightbox"
                        data-testid="media-preview-figure"
                        @click="openLightbox"
                        @keydown.enter.prevent="openLightbox"
                        @keydown.space.prevent="openLightbox"
                    >
                        <!-- No `w-full`: a small image must stay at native size. -->
                        <img
                            :src="previewSrc ?? ''"
                            :alt="previewAlt"
                            class="max-h-full max-w-full object-contain"
                            data-testid="media-preview-img"
                        />
                        <div
                            v-if="selectedDerivativeId !== 'source'"
                            class="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm"
                            data-testid="media-preview-derivative-badge"
                        >
                            Viewing derivative
                        </div>
                        <div class="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-foreground/40 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                            <span class="inline-flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs font-medium text-foreground">
                                <Eye class="h-3.5 w-3.5" /> Click to zoom
                            </span>
                        </div>
                    </button>
                    <div
                        v-else-if="previewKind === 'pdf'"
                        class="flex-col items-center justify-center gap-4 rounded-lg border border-border bg-muted p-8"
                        :class="previewSurfaceClass"
                        data-testid="media-preview-pdf"
                    >
                        <FileText class="h-12 w-12 text-muted-foreground" />
                        <div class="text-sm font-medium text-foreground">{{ previewAlt }}</div>
                        <a
                            :href="downloadSrc"
                            :download="downloadName"
                            class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                            data-testid="media-preview-pdf-download"
                        >
                            <Download class="h-4 w-4" />
                            Download PDF
                        </a>
                    </div>
                    <video
                        v-else-if="previewKind === 'video'"
                        controls
                        muted
                        playsinline
                        class="max-h-[40vh] w-full cursor-zoom-in rounded-lg border border-border object-contain lg:max-h-[70vh]"
                        :src="previewSrc ?? ''"
                        data-testid="media-page-video"
                        @click="openLightbox"
                        @keydown.enter.prevent="openLightbox"
                        @keydown.space.prevent="openLightbox"
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
                        v-else-if="previewKind === 'audio'"
                        controls
                        class="w-full"
                        :src="previewSrc ?? ''"
                        data-testid="media-page-audio"
                    />
                    <!-- The container is a div, not a `<pre>`: the
                         markdown branch must not inherit `font-mono`. -->
                    <div
                        v-else-if="previewKind === 'text'"
                        class="min-h-[160px] overflow-auto rounded-lg border border-border bg-muted p-4 text-xs leading-relaxed text-foreground lg:max-h-[70vh]"
                        data-testid="media-preview-text"
                    >
                        <div
                            v-if="isMarkdownPreview && textSource !== null"
                            class="text-sm"
                            data-testid="media-preview-markdown"
                        >
                            <MdPreview
                                :model-value="textSource"
                                :language="MARKDOWN_LOCALE"
                                class="bg-transparent"
                                data-testid="media-preview-markdown-body"
                            />
                        </div>
                        <pre
                            v-else-if="textSource !== null"
                            class="font-mono"
                            data-testid="media-preview-text-raw"
                        ><code data-testid="media-preview-text-body">{{ textSource }}</code></pre>
                        <p
                            v-else-if="textSourceLoading"
                            class="text-muted-foreground"
                            data-testid="media-preview-text-loading"
                        >
                            Loading source…
                        </p>
                        <p
                            v-else-if="textSourceError"
                            class="text-destructive"
                            data-testid="media-preview-text-error"
                        >
                            Couldn't load source: {{ textSourceError }}
                        </p>
                    </div>
                    <!-- Content-sized: a full-bleed box made an unrenderable file
                         look like a failed preview. -->
                    <div
                        v-else
                        class="flex flex-col items-center justify-center gap-3 self-start rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center"
                        data-testid="media-preview-fallback"
                    >
                        <FileText class="h-8 w-8 text-muted-foreground" />
                        <p class="text-sm text-foreground">
                            No inline preview for
                            <span class="font-medium">{{ previewUnavailableLabel }}</span>
                        </p>
                        <p class="max-w-xs text-xs text-muted-foreground">
                            Download the file or open it in a new tab to view it.
                        </p>
                        <div class="mt-1 flex flex-wrap justify-center gap-2">
                            <a
                                :href="downloadSrc"
                                :download="downloadName"
                                class="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                                data-testid="media-preview-fallback-download"
                            >
                                <Download class="h-3.5 w-3.5" />
                                Download
                            </a>
                            <a
                                :href="downloadSrc"
                                target="_blank"
                                rel="noopener"
                                class="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                                data-testid="media-preview-fallback-open"
                            >
                                <ExternalLink class="h-3.5 w-3.5" />
                                Open in new tab
                            </a>
                        </div>
                    </div>
                </div>

                <!-- Info column: actions, sharing, metadata, prompt, lifecycle. -->
                <div class="flex min-w-0 flex-col gap-6" data-testid="media-detail-info-column">
                    <!-- Primary actions -->
                    <div class="flex flex-wrap gap-2">
                        <a
                            :href="downloadSrc"
                            :download="downloadName"
                            :title="downloadLabel"
                            class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                            data-testid="media-page-download"
                        >
                            <Download class="h-4 w-4" />
                            {{ downloadLabel }}
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
                                    ref="editingInput"
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
                        <button
                            v-if="editingField !== 'prompt'"
                            type="button"
                            class="cursor-pointer w-full rounded-md bg-muted/60 p-3 text-left text-sm text-foreground hover:bg-muted"
                            data-testid="prompt-edit-button"
                            @click="startEditing('prompt', asset.prompt)"
                            @keydown.enter.prevent="startEditing('prompt', asset.prompt)"
                            @keydown.space.prevent="startEditing('prompt', asset.prompt)"
                        >
                            {{ asset.prompt ?? '(no prompt — click to add)' }}
                        </button>
                        <form v-else class="flex flex-col gap-2" @submit.prevent="saveField('prompt')">
                            <label for="media-prompt-input" class="sr-only">Prompt</label>
                            <textarea
                                id="media-prompt-input"
                                ref="editingInput"
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

                    <!-- Temporary-file lifecycle (spora-core PR #238) -->
                    <section v-if="asset.is_temporary === true" class="border-t border-border pt-4">
                        <button
                            type="button"
                            :disabled="keepingAsset"
                            class="inline-flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            data-testid="keep-asset-button"
                            @click="keepAsset"
                        >
                            <Pin class="h-3.5 w-3.5" />
                            Keep file
                        </button>
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
                </div>
            </div>
        </template>

        <!-- Lightbox dialog -->
        <dialog
            v-if="lightboxOpen && asset && (previewKind === 'image' || previewKind === 'video')"
            ref="lightboxRef"
            class="fixed inset-0 z-50 m-0 flex h-full w-full max-w-none items-center justify-center bg-foreground/80 p-4 backdrop:bg-foreground/80"
            aria-modal="true"
            aria-label="Media preview"
            data-testid="media-lightbox"
            @cancel.prevent="closeLightbox"
            @close="closeLightbox"
            @click.self="closeLightbox"
            @keydown.escape.prevent="closeLightbox"
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
                v-if="previewKind === 'image'"
                :src="previewSrc ?? ''"
                :alt="previewAlt"
                class="max-h-[90vh] max-w-[90vw] rounded object-contain shadow-2xl"
                data-testid="lightbox-img"
            />
            <video
                v-else
                controls
                muted
                playsinline
                :src="previewSrc ?? ''"
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