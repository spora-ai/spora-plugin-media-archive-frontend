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
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
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
    /**
     * What the deletion costs, in the caller's own words — "2 selected
     * assets are used in chats and will disappear from them." Empty when
     * there is nothing to warn about.
     */
    warning?: string
    /**
     * What the panel says while the chat-reference lookup is running.
     *
     * A non-empty label means the lookup is running: the confirm button
     * is disabled until the lookup settles, because a deletion confirmed
     * before its consequence is known is the case the warning exists for.
     */
    checking?: string
}>(), {
    confirmLabel: '',
    busy: false,
    warning: '',
    checking: '',
})

const emit = defineEmits<{
    (event: 'confirm'): void
    (event: 'close'): void
}>()

const { t } = useI18n()

/**
 * Whether the chat-reference lookup is still running.
 *
 * The confirm button waits for it: the operator must not confirm a
 * deletion whose consequence is not on screen yet.
 */
const lookupPending = computed(() => props.checking !== '')

const dialogRef = ref<HTMLDialogElement | null>(null)

// The dialogs are mounted one at a time, but the ids still have to be
// unique in the document: the panel's bulk dialog and the detail
// page's share the names.
const uid = useId()
const titleId = `delete-title-${uid}`
const descriptionId = `delete-desc-${uid}`
const warningId = `delete-warning-${uid}`

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
        :aria-describedby="`${descriptionId} ${warningId}`"
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
                <!--
                    The live region. It is mounted with the dialog and
                    stays empty until the warning arrives, so a screen
                    reader hears the consequence of the deletion without
                    the focus moving — a region that mounts together with
                    its text is not announced.

                    An `<output>` carries the `status` role implicitly, and
                    it is the element a screen reader announces across
                    devices — `role="status"` on a `<div>` is not.
                -->
                <output
                    :id="warningId"
                    class="block"
                    data-testid="delete-warning-status"
                >
                    <span
                        v-if="warning !== ''"
                        class="mt-3 block rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                        data-testid="delete-warning"
                    >
                        {{ warning }}
                    </span>
                </output>
                <p
                    v-if="lookupPending"
                    class="mt-3 text-xs text-muted-foreground"
                    data-testid="delete-checking"
                >
                    {{ checking }}
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
                        :disabled="busy || lookupPending"
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
