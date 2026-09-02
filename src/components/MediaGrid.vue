<script setup lang="ts">
import MediaCard from './MediaCard.vue'
import type { MediaAsset } from '../types'

const props = withDefaults(defineProps<{ assets?: MediaAsset[] | null }>(), {
    assets: () => [],
})

/**
 * The grid forwards a card click to the parent's `select` event so the
 * caller (App.vue) can decide whether to navigate to the detail page
 * or, in the future, open a quick-view modal. The `upload-click`
 * trigger mirrors the same pattern: the empty-state CTA lives next to
 * the grid's copy so the affordance is colocated, but the parent owns
 * the dialog so it can stay focused on the page-level state.
 */
const emit = defineEmits<{
    (event: 'select', asset: MediaAsset): void
    (event: 'upload-click'): void
}>()
</script>

<template>
    <div
        v-if="(props.assets ?? []).length === 0"
        class="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground"
        data-testid="media-grid-empty"
    >
        No media yet — generate something with a companion plugin to see it
        here.
        <button
            type="button"
            class="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            data-testid="media-grid-upload-cta"
            @click="emit('upload-click')"
        >
            Upload your first document
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
            @click="emit('select', asset)"
        />
    </div>
</template>
