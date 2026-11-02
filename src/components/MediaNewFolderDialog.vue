<script setup lang="ts">
/**
 * MediaNewFolderDialog — create a folder.
 *
 * A dialog, not a form wedged under the tree: creating a folder takes
 * three answers — the name, the principal it belongs to, and the parent
 * it sits under — and a form under the tree has no room for the third.
 * It follows the upload dialog's shape, because both are the operator's
 * dialog.
 *
 * The parent is chosen from a tree picker rather than a `<select>`: a
 * select cannot show the tree, and the tree is the thing being chosen
 * between.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Folder, FolderTree } from 'lucide-vue-next'
import type { MediaFolder, MediaPrincipal } from '../types'
import type { PluginHostContext } from '../shims'
import { buildFolderTree, flattenFolderTree } from '../lib/folder-tree'

const props = withDefaults(defineProps<{
    hostContext: PluginHostContext
    principals: MediaPrincipal[]
    /**
     * The folders of every visible principal, by principal id. The
     * picker shows the ones belonging to the chosen principal.
     */
    foldersByPrincipal?: Record<number, MediaFolder[]>
    /**
     * The principal the folder belongs to when the dialog opens.
     */
    defaultPrincipalId?: number | null
    /**
     * The folder the new folder sits under when the dialog opens.
     */
    defaultParentId?: string | null
}>(), {
    foldersByPrincipal: () => ({}),
    defaultPrincipalId: null,
    defaultParentId: null,
})

const emit = defineEmits<{
    (event: 'created', payload: { folder: MediaFolder; principalId: number }): void
    (event: 'close'): void
}>()

const { t } = useI18n()

const dialogRef = ref<HTMLDialogElement | null>(null)
const name = ref('')

/**
 * The principal the folder belongs to.
 *
 * A folder always belongs to one principal, so the "all principals" scope
 * has to pick one — the first visible principal is the same default the
 * server falls back to.
 *
 * A chosen **parent** decides the owner instead: the server refuses a
 * parent of another principal with a 404, so an overlay that opened on a
 * parent of one principal and an owner of another would be offering a
 * combination that cannot be created.
 */
function initialPrincipalId(): number | null {
    const parent = props.defaultParentId
    if (parent !== null && parent !== '') {
        for (const [principalId, folders] of Object.entries(props.foldersByPrincipal)) {
            if (folders.some((folder) => folder.id === parent)) {
                return Number(principalId)
            }
        }
    }
    return props.defaultPrincipalId ?? props.principals[0]?.id ?? null
}

const principalId = ref<number | null>(initialPrincipalId())
const parentId = ref<string>(props.defaultParentId ?? '')
const error = ref<string | null>(null)
const submitting = ref(false)

const principalOptions = computed(() => props.principals)

/**
 * The folders the parent picker offers: the chosen principal's own tree,
 * flattened so the markup can indent it without recursing.
 */
const parentRows = computed(() => {
    const folders = principalId.value === null
        ? []
        : props.foldersByPrincipal[principalId.value] ?? []
    return flattenFolderTree(buildFolderTree(folders))
})

const parentFolder = computed(() => {
    if (parentId.value === '') return null
    for (const list of Object.values(props.foldersByPrincipal)) {
        const found = list.find((folder) => folder.id === parentId.value)
        if (found !== undefined) return found
    }
    return null
})

/**
 * What the folder will be called, so the operator sees it before they
 * call it. The path is the parent's path plus the name — the same shape
 * the server builds.
 */
const pathPreview = computed(() => {
    const parentPath = parentFolder.value?.path ?? ''
    const trimmed = parentPath === '' ? '' : parentPath.replace(/^\//, '')
    const trimmedName = name.value.trim()
    if (trimmed === '' && trimmedName === '') return ''
    return trimmed === '' ? trimmedName : `${trimmed} / ${trimmedName}`
})

function principalLabel(principal: MediaPrincipal): string {
    if (principal.type === 'user') return t('My Media')
    return t('Group #{id}', { id: principal.id })
}

function close(): void {
    if (dialogRef.value?.open) {
        dialogRef.value.close()
    }
    emit('close')
}

/**
 * The host's typed client throws an `ApiError` on non-2xx. The core
 * refuses a duplicate sibling name with 422 `NOT_UNIQUE`, and that is the
 * one refusal the operator can act on without reading the server's
 * wording.
 */
interface ApiErrorShape {
    code?: string
    message?: string
}

async function submit(): Promise<void> {
    if (submitting.value) return
    const trimmed = name.value.trim()
    if (trimmed === '') {
        error.value = t('Give the folder a name.')
        return
    }
    if (principalId.value === null) {
        error.value = t('Choose the principal the folder belongs to.')
        return
    }

    submitting.value = true
    error.value = null
    const principal = principalId.value
    try {
        const folder = await props.hostContext.api.post<MediaFolder>('/media/folders', {
            name: trimmed,
            parent_id: parentId.value === '' ? null : parentId.value,
            principal_id: principal,
        })
        emit('created', { folder, principalId: principal })
        close()
    } catch (e: unknown) {
        const apiError = e as ApiErrorShape
        if (apiError.code === 'NOT_UNIQUE') {
            error.value = t('A folder called “{name}” already exists here.', { name: trimmed })
        } else if (typeof apiError.message === 'string' && apiError.message !== '') {
            error.value = apiError.message
        } else {
            error.value = t('The folder could not be created.')
        }
    } finally {
        submitting.value = false
    }
}

onMounted(() => {
    // The parent mounts the dialog with `v-if` and holds no template ref,
    // so the dialog opens itself — same as the upload dialog.
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
        class="m-0 border-0 bg-transparent p-0"
        aria-labelledby="new-folder-title"
        data-testid="media-new-folder-dialog"
        @cancel.prevent="close"
    >
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
            data-testid="new-folder-backdrop"
        >
            <form
                class="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-2xl"
                data-testid="media-new-folder-form"
                @submit.prevent="submit"
            >
                <h2 id="new-folder-title" class="text-base font-semibold">{{ t('New folder') }}</h2>
                <p class="mt-1 text-xs text-muted-foreground">
                    {{ t('A folder belongs to one principal and sits under one parent.') }}
                </p>

                <div class="mt-4 flex flex-col gap-3">
                    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                        {{ t('Name') }}
                        <input
                            type="text"
                            :value="name"
                            autocomplete="off"
                            :placeholder="t('Folder name')"
                            class="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                            data-testid="media-new-folder-name"
                            @input="name = ($event.target as HTMLInputElement).value"
                        />
                    </label>

                    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
                        {{ t('Belongs to') }}
                        <select
                            :value="principalId === null ? '' : String(principalId)"
                            class="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                            data-testid="media-new-folder-principal"
                            @change="principalId = Number(($event.target as HTMLSelectElement).value); parentId = ''"
                        >
                            <option v-for="principal in principalOptions" :key="principal.id" :value="String(principal.id)">
                                {{ principalLabel(principal) }}
                            </option>
                        </select>
                    </label>

                    <div class="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span>{{ t('Parent') }}</span>
                        <div
                            class="max-h-56 overflow-y-auto rounded border border-border bg-background p-1"
                            data-testid="media-new-folder-parents"
                        >
                            <button
                                type="button"
                                class="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted"
                                :class="parentId === '' ? 'bg-muted font-medium' : ''"
                                data-testid="media-new-folder-parent-none"
                                @click="parentId = ''"
                            >
                                <FolderTree class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span class="flex-1">{{ t('All media') }}</span>
                                <Check v-if="parentId === ''" class="h-3.5 w-3.5 shrink-0 text-primary" />
                            </button>
                            <button
                                v-for="row in parentRows"
                                :key="row.folder.id"
                                type="button"
                                class="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted"
                                :class="parentId === row.folder.id ? 'bg-muted font-medium' : ''"
                                :style="{ paddingLeft: `${0.5 + row.depth * 0.9}rem` }"
                                :data-testid="`media-new-folder-parent-${row.folder.id}`"
                                @click="parentId = row.folder.id"
                            >
                                <Folder class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span class="min-w-0 flex-1 truncate">{{ row.folder.name }}</span>
                                <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                    {{ row.folder.asset_count }}
                                </span>
                                <Check v-if="parentId === row.folder.id" class="h-3.5 w-3.5 shrink-0 text-primary" />
                            </button>
                        </div>
                    </div>

                    <p
                        v-if="pathPreview !== ''"
                        class="text-[11px] text-muted-foreground"
                        data-testid="media-new-folder-path"
                    >
                        {{ t('The folder will be {path}.', { path: pathPreview }) }}
                    </p>

                    <p
                        v-if="error !== null"
                        class="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                        data-testid="media-new-folder-error"
                    >
                        {{ error }}
                    </p>
                </div>

                <div class="flex justify-end gap-2 pt-4">
                    <button
                        type="button"
                        class="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
                        data-testid="media-new-folder-cancel"
                        @click="close"
                    >
                        {{ t('Cancel') }}
                    </button>
                    <button
                        type="submit"
                        class="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        :disabled="submitting"
                        data-testid="media-new-folder-submit"
                    >
                        {{ t('Create folder') }}
                    </button>
                </div>
            </form>
        </div>
    </dialog>
</template>
