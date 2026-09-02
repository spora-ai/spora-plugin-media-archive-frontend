<script setup lang="ts">
/**
 * MediaUploadDialog — modal that lets a Media Archive operator upload a
 * file and attribute it to one of their visible principals.
 *
 * The plugin frontend is principal-first: every asset must be tagged
 * with a `principal_id` so that sibling agents and future uploads under
 * the same principal share a single scope on the LIST endpoint. The
 * controller's `visiblePrincipalIds()` intersect guards against
 * foreign ids; this dialog just gives the operator a way to pick one
 * from the caller's chip row.
 *
 * Resolution chain for the default principal id (when
 * `defaultPrincipalId` is `null`):
 *  1. The currently-active scope chip in `App.vue` (user-principal or
 *     a specific group).
 *  2. The caller's user-principal — every authenticated user has at
 *     least one, by definition.
 *  3. The first group-principal — covers single-group tenants whose
 *     user-principal is missing for legacy reasons.
 *  4. Dialog disabled when no principal resolves.
 *
 * The component is plugin-agnostic: it only knows about the wire
 * shapes in `../types.ts` and the two API endpoints
 * (`/media/allowed-types` for the `<input accept>` attribute and
 * `POST /media` for the upload). It never reaches into Typst-,
 * Tavily-, or any plugin-specific code.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Upload, X } from 'lucide-vue-next'
import type { MediaAsset, MediaPrincipal } from '../types'
import type { PluginHostContext } from '../shims'

interface AllowedTypes {
    mime_types: string[]
    extensions: string[]
}

interface Props {
    /**
     * The host context exposes the typed REST client. Plugin code never
     * imports from `@/composables/...` — it goes through `hostContext`
     * to keep dependency surfaces auditable.
     */
    hostContext: PluginHostContext
    principals: MediaPrincipal[]
    /**
     * Map of `groupPrincipalId → groupName`. Empty until
     * `App.vue`'s bootstrap fetch resolves; the dialog falls back to
     * `Group #${id}` while the lookup is in flight.
     */
    groupLabels: Record<number, string>
    /**
     * Currently-active scope chip id from `App.vue` (`null` = ALL).
     * The dialog uses it as the default selection so the upload lands
     * in the same scope the operator was already browsing.
     */
    defaultPrincipalId: number | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
    (event: 'uploaded', asset: MediaAsset): void
    (event: 'close'): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const file = ref<File | null>(null)
const principalId = ref<number | null>(null)
const prompt = ref('')
const tags = ref('')
const uploading = ref(false)
const error = ref<string | null>(null)
const acceptAttr = ref('')

function labelForPrincipal(p: MediaPrincipal): string {
    if (p.type === 'user') {
        return 'My Media'
    }
    return props.groupLabels[p.id] ?? `Group #${p.id}`
}

/**
 * Each principal as an `<option>` row. The dialog keeps the full list
 * so the operator can flip between principals without a remount;
 * `MediaArchiveController`'s `visiblePrincipalIds()` intersect guards
 * against foreign ids.
 */
const principalOptions = computed(() =>
    props.principals.map((p) => ({
        id: p.id,
        label: labelForPrincipal(p),
    })),
)

/**
 * Resolve `defaultPrincipalId` against the actual principal list. The
 * caller may pass a stale id (operator toggled to ALL between dialog
 * open and state init); we silently downgrade to the user-principal /
 * first-group-principal fallback chain.
 */
function resolveInitialPrincipal(): number | null {
    if (props.defaultPrincipalId !== null
        && props.principals.some((p) => p.id === props.defaultPrincipalId)) {
        return props.defaultPrincipalId
    }
    const userPrincipal = props.principals.find((p) => p.type === 'user')
    if (userPrincipal !== undefined) {
        return userPrincipal.id
    }
    return props.principals[0]?.id ?? null
}

async function loadAllowedTypes(): Promise<void> {
    try {
        const response = await props.hostContext.api.get<AllowedTypes>(
            '/media/allowed-types',
        )
        const mimes = response.mime_types ?? []
        const exts = response.extensions ?? []
        const accept = [
            ...mimes,
            ...exts.map((e) => (e.startsWith('.') ? e : `.${e}`)),
        ]
        acceptAttr.value = accept.join(',')
    } catch {
        // Best-effort: leaving the accept attribute empty lets the
        // file picker fall back to the host's default allowlist.
        acceptAttr.value = ''
    }
}

function open(): void {
    error.value = null
    file.value = null
    prompt.value = ''
    tags.value = ''
    principalId.value = resolveInitialPrincipal()
    void loadAllowedTypes()
    dialogRef.value?.showModal()
}

function close(): void {
    if (dialogRef.value?.open) {
        dialogRef.value.close()
    }
    emit('close')
}

function onFilePicked(event: Event): void {
    const target = event.target as HTMLInputElement
    const next = target.files?.[0] ?? null
    file.value = next
}

function onDrop(event: DragEvent): void {
    event.preventDefault()
    const dropped = event.dataTransfer?.files
    if (dropped === undefined || dropped.length === 0) return
    file.value = dropped[0] ?? null
}

function onDragOver(event: DragEvent): void {
    event.preventDefault()
}

const canSubmit = computed(() =>
    file.value !== null
    && principalId.value !== null
    && !uploading.value,
)

/**
 * The host's typed client throws an `ApiError` on non-2xx;
 * `error.code === 'FORBIDDEN_PRINCIPAL'` is the specific signal from
 * `MediaUploadController` when the operator passes a principal id
 * outside their visible set. We surface that message verbatim so the
 * operator understands why the dialog rejected their submit.
 */
interface ApiErrorShape {
    code?: string
    message?: string
}

async function submit(): Promise<void> {
    if (!canSubmit.value) return
    const picked = file.value
    const principal = principalId.value
    if (picked === null || principal === null) return
    uploading.value = true
    error.value = null
    try {
        const form = new FormData()
        form.append('file', picked)
        form.append('principal_id', String(principal))
        if (picked.name !== '') {
            form.append('filename', picked.name)
        }
        if (prompt.value.trim() !== '') {
            form.append('prompt', prompt.value.trim())
        }
        if (tags.value.trim() !== '') {
            form.append('tags', tags.value.trim())
        }
        const asset = await props.hostContext.api.postForm<MediaAsset>(
            '/media',
            form,
        )
        emit('uploaded', asset)
        close()
    } catch (e: unknown) {
        const apiErr = e as ApiErrorShape
        if (apiErr.code === 'FORBIDDEN_PRINCIPAL') {
            error.value = 'You can only upload into a principal you belong to.'
        } else if (typeof apiErr.message === 'string' && apiErr.message !== '') {
            error.value = apiErr.message
        } else {
            error.value = 'Upload failed.'
        }
    } finally {
        uploading.value = false
    }
}

defineExpose({ open, close })

onMounted(() => {
    principalId.value = resolveInitialPrincipal()
    // Parent mounts the dialog via `v-if="uploadDialogOpen"` and never
    // holds a template ref, so we open ourselves here. Without this the
    // `<dialog>` element is in the DOM but closed — clicks on the header
    // Upload button look like nothing happens.
    dialogRef.value?.showModal()
})

watch(() => props.principals, () => {
    if (principalId.value === null
        || !props.principals.some((p) => p.id === principalId.value)) {
        principalId.value = resolveInitialPrincipal()
    }
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
        class="m-0 border-0 bg-transparent p-0"
        aria-labelledby="upload-title"
        data-testid="media-upload-dialog"
        @cancel.prevent="close"
    >
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
            data-testid="upload-dialog-backdrop"
            @click.self="close"
        >
            <div
                class="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-2xl"
                @click.stop
            >
                <h2 id="upload-title" class="text-base font-semibold">Upload media</h2>
                <p class="mt-1 text-xs text-muted-foreground">
                    Attribute the upload to one of your principals so it appears in
                    the right scope on the LIST endpoint.
                </p>

                <form class="mt-4 flex flex-col gap-3" data-testid="media-upload-form" @submit.prevent="submit">
                    <label
                        class="flex flex-col items-center justify-center gap-2 rounded border border-dashed border-border bg-muted/30 p-6 text-xs text-muted-foreground"
                        data-testid="upload-dropzone"
                        @drop="onDrop"
                        @dragover="onDragOver"
                    >
                        <Upload class="h-5 w-5" />
                        <span>Drag a file here, or pick one below</span>
                        <input
                            type="file"
                            class="block w-full text-xs text-foreground file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground"
                            :accept="acceptAttr"
                            data-testid="upload-file-input"
                            @change="onFilePicked"
                        />
                        <span
                            v-if="file"
                            class="truncate text-foreground"
                            data-testid="upload-filename"
                        >
                            {{ file.name }} ({{ Math.round(file.size / 1024) }} KB)
                        </span>
                    </label>

                    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                        Principal
                        <select
                            v-model.number="principalId"
                            class="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                            data-testid="upload-principal-select"
                        >
                            <option
                                v-for="opt in principalOptions"
                                :key="opt.id"
                                :value="opt.id"
                            >
                                {{ opt.label }}
                            </option>
                        </select>
                    </label>

                    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                        Prompt (optional)
                        <input
                            v-model="prompt"
                            type="text"
                            class="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                            data-testid="upload-prompt-input"
                        />
                    </label>

                    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                        Tags (comma-separated, optional)
                        <input
                            v-model="tags"
                            type="text"
                            class="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                            data-testid="upload-tags-input"
                        />
                    </label>

                    <p
                        v-if="error"
                        class="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                        data-testid="upload-error"
                    >
                        {{ error }}
                    </p>

                    <div class="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                            data-testid="upload-cancel"
                            @click="close"
                        >
                            <X class="h-3.5 w-3.5" />
                            Cancel
                        </button>
                        <button
                            type="submit"
                            :disabled="!canSubmit"
                            class="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            data-testid="upload-submit"
                        >
                            <Upload class="h-3.5 w-3.5" />
                            {{ uploading ? 'Uploading…' : 'Upload' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </dialog>
</template>
