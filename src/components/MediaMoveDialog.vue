<script setup lang="ts">
/**
 * MediaMoveDialog — file several assets into one folder.
 *
 * A folder belongs to one principal, and the server scopes a folder
 * write by the asset's principal: filing an asset of another principal
 * into a folder is refused with a 422. So a selection that spans
 * principals cannot be filed into one folder as a whole — the dialog
 * asks which principal's folders to file into, and the assets of the
 * others are reported as skipped rather than silently refused.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MediaAsset, MediaFolder, MediaPrincipal } from '../types'
import type { PluginHostContext } from '../shims'
import MediaFolderPicker from './MediaFolderPicker.vue'

const props = defineProps<{
    hostContext: PluginHostContext
    /**
     * The assets to file.
     */
    assets: MediaAsset[]
    principals: MediaPrincipal[]
    /**
     * Map of `groupPrincipalId → groupName`.
     */
    groupLabels: Record<number, string>
    /**
     * The folders of every visible principal, by principal id.
     */
    foldersByPrincipal: Record<number, MediaFolder[]>
}>()

const emit = defineEmits<{
    (event: 'moved', payload: {
        moved: MediaAsset[]
        skipped: number
        failed: number
    }): void
    (event: 'close'): void
}>()

const { t } = useI18n()

const dialogRef = ref<HTMLDialogElement | null>(null)
const folderId = ref<string | null>(null)
const busy = ref(false)

/**
 * The principals the selection holds assets of, with the number of
 * assets each holds.
 */
const principals = computed(() => {
    const counts = new Map<number, number>()
    for (const asset of props.assets) {
        if (typeof asset.principal_id !== 'number') {
            continue
        }
        counts.set(asset.principal_id, (counts.get(asset.principal_id) ?? 0) + 1)
    }
    return props.principals
        .filter((principal) => counts.has(principal.id))
        .map((principal) => ({ principal, count: counts.get(principal.id) ?? 0 }))
})

const principalId = ref<number | null>(principals.value[0]?.principal.id ?? null)

function principalLabel(principal: MediaPrincipal, count: number): string {
    const name = principal.type === 'user'
        ? t('My Media')
        : props.groupLabels[principal.id] ?? t('Group #{id}', { id: principal.id })
    return t('{name} ({count})', { name, count })
}

/**
 * The assets that can be filed into the chosen principal's folders.
 */
const fileable = computed(() =>
    props.assets.filter((asset) => asset.principal_id === principalId.value),
)

/**
 * The assets that cannot: they belong to another principal, or to none
 * at all — a folder of no principal is no folder.
 */
const skipped = computed(() => props.assets.length - fileable.value.length)

const folders = computed<MediaFolder[]>(() =>
    principalId.value === null ? [] : props.foldersByPrincipal[principalId.value] ?? [],
)

async function submit(): Promise<void> {
    if (busy.value) return
    busy.value = true
    const moved: MediaAsset[] = []
    let failed = 0
    try {
        // Every asset is filed on its own: the server scopes a folder
        // write by the asset's principal and refuses a filename that is
        // taken in the target folder. One refusal must not hold up the
        // rest, so they are settled together and counted afterwards.
        const results = await Promise.allSettled(
            fileable.value.map((asset) => props.hostContext.api.patch<MediaAsset>(
                `/media/${asset.id}`,
                { folder_id: folderId.value },
            )),
        )
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                moved.push(result.value)
            } else {
                failed++
            }
        }
    } finally {
        busy.value = false
    }
    emit('moved', { moved, skipped: skipped.value, failed })
    close()
}

function close(): void {
    if (dialogRef.value?.open) {
        dialogRef.value.close()
    }
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
        class="m-0 border-0 bg-transparent p-0"
        aria-labelledby="bulk-move-title"
        data-testid="media-move-dialog"
        @cancel.prevent="close"
    >
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
            data-testid="move-dialog-backdrop"
        >
            <form
                class="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-2xl"
                data-testid="media-move-form"
                @submit.prevent="submit"
            >
                <h2 id="bulk-move-title" class="text-base font-semibold">
                    {{ t('Move {count} asset | Move {count} assets', { count: assets.length }) }}
                </h2>

                <div class="mt-4 flex flex-col gap-3">
                    <label
                        v-if="principals.length > 1"
                        class="flex flex-col gap-1 text-xs text-muted-foreground"
                    >
                        {{ t('Belongs to') }}
                        <select
                            :value="principalId === null ? '' : String(principalId)"
                            class="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                            data-testid="media-move-principal"
                            @change="principalId = Number(($event.target as HTMLSelectElement).value); folderId = null"
                        >
                            <option
                                v-for="entry in principals"
                                :key="entry.principal.id"
                                :value="String(entry.principal.id)"
                            >
                                {{ principalLabel(entry.principal, entry.count) }}
                            </option>
                        </select>
                    </label>

                    <div class="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span>{{ t('Folder') }}</span>
                        <MediaFolderPicker
                            :folders="folders"
                            :model-value="folderId"
                            :label="t('Folder')"
                            testid="media-move-folder"
                            @update:model-value="folderId = $event"
                        />
                    </div>

                    <p
                        v-if="skipped > 0"
                        class="text-[11px] text-muted-foreground"
                        data-testid="media-move-skipped"
                    >
                        {{ t('{count} selected asset belongs to another principal and stays where it is. | {count} selected assets belong to another principal and stay where they are.', { count: skipped }) }}
                    </p>
                </div>

                <div class="flex justify-end gap-2 pt-4">
                    <button
                        type="button"
                        class="rounded px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
                        data-testid="media-move-cancel"
                        @click="close"
                    >
                        {{ t('Cancel') }}
                    </button>
                    <button
                        type="submit"
                        :disabled="busy"
                        class="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        data-testid="media-move-submit"
                    >
                        {{ t('Move') }}
                    </button>
                </div>
            </form>
        </div>
    </dialog>
</template>
