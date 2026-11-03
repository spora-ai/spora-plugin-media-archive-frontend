<script setup lang="ts">
/**
 * MediaDeleteDialog — the confirmation before a deletion.
 *
 * One component for the single deletion on the detail page and the bulk
 * deletion from the grid: the confirmation is the same shape, and two
 * shapes would mean two places to keep the wording right.
 *
 * The centring is explicit. A native `<dialog>` is centred by the
 * browser's own `margin: auto`, and the host's preflight resets
 * `margin: 0` on every element — so without this the dialog sticks to
 * the upper left corner.
 */
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{
    /**
     * The question the dialog asks.
     */
    title: string
    /**
     * What happens if the operator confirms.
     */
    description: string
    /**
     * The label of the confirm button. "Delete" unless the caller says
     * otherwise.
     */
    confirmLabel?: string
    /**
     * Whether the deletion is running. The button is disabled so the
     * operator cannot fire it twice.
     */
    busy?: boolean
}>(), {
    confirmLabel: '',
    busy: false,
})

const emit = defineEmits<{
    (event: 'confirm'): void
    (event: 'close'): void
}>()

const { t } = useI18n()

const dialogRef = ref<HTMLDialogElement | null>(null)

// The dialogs are mounted one at a time, but the ids still have to be
// unique in the document: the panel's bulk dialog and the detail
// page's share the names.
const uid = useId()
const titleId = `delete-title-${uid}`
const descriptionId = `delete-desc-${uid}`

function close(): void {
    if (dialogRef.value?.open) {
        dialogRef.value.close()
    }
    emit('close')
}

onMounted(() => {
    // The parent mounts the dialog with `v-if` and holds no template
    // ref, so the dialog opens itself — same as the upload dialog.
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
        :aria-labelledby="titleId"
        :aria-describedby="descriptionId"
        data-testid="delete-confirm-dialog"
        @cancel.prevent="close"
    >
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
            data-testid="delete-confirm-backdrop"
        >
            <div class="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-2xl">
                <h2 :id="titleId" class="text-base font-semibold">{{ title }}</h2>
                <p :id="descriptionId" class="mt-2 text-sm text-muted-foreground">
                    {{ description }}
                </p>
                <div class="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        class="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                        data-testid="delete-cancel"
                        @click="close"
                    >
                        {{ t('Cancel') }}
                    </button>
                    <button
                        type="button"
                        :disabled="busy"
                        class="rounded bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                        data-testid="delete-confirm"
                        @click="emit('confirm')"
                    >
                        {{ confirmLabel === '' ? t('Delete') : confirmLabel }}
                    </button>
                </div>
            </div>
        </div>
    </dialog>
</template>
