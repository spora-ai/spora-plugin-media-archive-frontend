<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaCard from './MediaCard.vue'
import type { MediaAsset, MediaFolder, MediaFolderFilter } from '../types'

const props = withDefaults(defineProps<{
    assets?: MediaAsset[] | null
    /**
     * The folders of every visible principal. The asset carries only a
     * `folder_id`, so the name on the card comes from here.
     */
    folders?: MediaFolder[] | null
    /**
     * Which slice of the library the listing shows. The empty state
     * says which one it is: "no media yet" is wrong for an empty
     * folder in a full archive, and wrong for a filter that found
     * nothing.
     */
    filter?: MediaFolderFilter
    /**
     * Whether the cards are selection targets instead of links to the
     * detail page.
     */
    selectable?: boolean
    /**
     * The ids of the selected assets.
     */
    selectedIds?: string[]
}>(), {
    assets: () => [],
    folders: () => [],
    filter: () => ({ kind: 'all' }),
    selectable: false,
    selectedIds: () => [],
})

const { t } = useI18n()

const emit = defineEmits<{
    (event: 'select', asset: MediaAsset): void
    (event: 'upload-click'): void
    (event: 'drag-start', asset: MediaAsset): void
    (event: 'drag-end'): void
    (event: 'toggle-select', asset: MediaAsset): void
}>()

const folderById = computed(() => {
    const map = new Map<string, MediaFolder>()
    for (const folder of props.folders ?? []) {
        map.set(folder.id, folder)
    }
    return map
})

const selected = computed(() => new Set(props.selectedIds))

/**
 * What the empty state says.
 *
 * The three scopes need three sentences: a library with nothing in it
 * is not an empty folder, and a filter that found nothing is not an
 * empty library.
 */
const emptyMessage = computed(() => {
    if (props.filter.kind === 'folder') {
        return t('This folder is empty.')
    }
    if (props.filter.kind === 'unfiled') {
        return t('Nothing is filed in a folder.')
    }
    return t('No media yet — generate something with a companion plugin to see it here.')
})
</script>

<template>
    <div
        v-if="(props.assets ?? []).length === 0"
        class="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground"
        data-testid="media-grid-empty"
    >
        {{ emptyMessage }}
        <button
            type="button"
            class="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            data-testid="media-grid-upload-cta"
            @click="emit('upload-click')"
        >
            {{ t('Upload your first document') }}
        </button>
    </div>
    <div
        v-else
        class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
        data-testid="media-grid"
    >
        <MediaCard
            v-for="asset in props.assets ?? []"
            :key="asset.id"
            :asset="asset"
            :folder="asset.folder_id ? folderById.get(asset.folder_id) ?? null : null"
            :selectable="selectable"
            :selected="selected.has(asset.id)"
            @select="emit('select', asset)"
            @toggle-select="emit('toggle-select', asset)"
            @drag-start="emit('drag-start', $event)"
            @drag-end="emit('drag-end')"
        />
    </div>
</template>
