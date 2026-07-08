<script setup lang="ts">
import MediaCard from './MediaCard.vue'
import type { MediaAsset } from '../types'

defineProps<{ assets: MediaAsset[] }>()
const emit = defineEmits<{ (event: 'select', asset: MediaAsset): void }>()
</script>

<template>
    <div
        v-if="assets.length === 0"
        class="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground"
        data-testid="media-grid-empty"
    >
        No media yet — generate something with a companion plugin to see it here.
    </div>
    <div
        v-else
        class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
        data-testid="media-grid"
    >
        <MediaCard
            v-for="asset in assets"
            :key="asset.id"
            :asset="asset"
            @click="emit('select', asset)"
        />
    </div>
</template>