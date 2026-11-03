<script setup lang="ts">
/**
 * MediaSelectionBar — what the operator can do with the selected
 * assets.
 *
 * The panel's actions on more than one asset: file them together, or
 * delete them together. It replaces the toolbar's right-hand side while
 * the selection mode is on, so the actions are where the operator is
 * looking.
 */
import { useI18n } from 'vue-i18n'
import { FolderInput, Trash2, X } from 'lucide-vue-next'

withDefaults(defineProps<{
    /**
     * How many assets are selected.
     */
    count: number
    /**
     * Whether every loaded asset is selected — the bar then offers to
     * clear the selection instead of extending it.
     */
    allSelected?: boolean
    /**
     * Whether an action is running.
     */
    busy?: boolean
}>(), {
    allSelected: false,
    busy: false,
})

const emit = defineEmits<{
    (event: 'move'): void
    (event: 'delete'): void
    (event: 'cancel'): void
    (event: 'select-all'): void
}>()

const { t } = useI18n()
</script>

<template>
    <div
        class="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
        data-testid="media-selection-bar"
    >
        <span class="text-sm font-medium text-foreground" data-testid="media-selection-count">
            {{ t('{count} asset selected | {count} assets selected', { count }) }}
        </span>

        <button
            type="button"
            class="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            data-testid="media-selection-select-all"
            @click="emit('select-all')"
        >
            {{ allSelected ? t('Deselect all') : t('Select all') }}
        </button>

        <div class="ml-auto flex items-center gap-2">
            <button
                type="button"
                :disabled="busy"
                class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
                data-testid="media-selection-move"
                @click="emit('move')"
            >
                <FolderInput class="h-3.5 w-3.5" />
                <span>{{ t('Move to folder') }}</span>
            </button>

            <button
                type="button"
                :disabled="busy"
                class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                data-testid="media-selection-delete"
                @click="emit('delete')"
            >
                <Trash2 class="h-3.5 w-3.5" />
                <span>{{ t('Delete') }}</span>
            </button>

            <button
                type="button"
                :aria-label="t('Cancel the selection')"
                class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                data-testid="media-selection-cancel"
                @click="emit('cancel')"
            >
                <X class="h-4 w-4" />
            </button>
        </div>
    </div>
</template>
