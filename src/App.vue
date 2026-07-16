<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Image, FileAudio, FileVideo, FileText, Search } from 'lucide-vue-next'
import type { PluginHostContext } from './shims'
import type { MediaAsset, MediaListQuery, MediaListResponse, MediaType } from './types'
import MediaGrid from './components/MediaGrid.vue'
import MediaFilters from './components/MediaFilters.vue'
import MediaDetailDrawer from './components/MediaDetailDrawer.vue'

import './style.css'

const props = defineProps<{ hostContext: PluginHostContext }>()

const api = computed(() => props.hostContext.api)
const assets = ref<MediaAsset[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const query = ref<MediaListQuery>({
    page: 1,
    perPage: 24,
    mediaType: '',
    pluginSlug: '',
    search: '',
})
const scope = ref<'all' | 'mine'>('all')
const total = ref(0)
const selected = ref<MediaAsset | null>(null)

/**
 * Monotonic `requestId` guard against stale responses from rapid filter
 * changes. When the user flips type/search/scope faster than the network
 * replies, only the latest result is allowed to update the grid. We also
 * flip `loading` off only for the latest request so the indicator does
 * not flicker between transitions.
 */
let requestId = 0

async function load(): Promise<void> {
    const myId = ++requestId
    loading.value = true
    error.value = null
    try {
        const params = new URLSearchParams()
        params.set('page', String(query.value.page ?? 1))
        params.set('per_page', String(query.value.perPage ?? 24))
        if (query.value.mediaType) params.set('type', query.value.mediaType)
        if (query.value.pluginSlug) params.set('plugin', query.value.pluginSlug)
        if (query.value.search) params.set('search', query.value.search)
        if (scope.value === 'mine') params.set('scope', 'mine')
        const response = await api.value.get<MediaListResponse>(
            `/media?${params.toString()}`,
        )
        if (myId !== requestId) return
        assets.value = response.assets
        total.value = response.total
    } catch (e) {
        if (myId !== requestId) return
        error.value = e instanceof Error ? e.message : String(e)
    } finally {
        if (myId === requestId) {
            loading.value = false
        }
    }
}

function setType(type: MediaType | ''): void {
    query.value = { ...query.value, mediaType: type, page: 1 }
    void load()
}

function setSearch(search: string): void {
    query.value = { ...query.value, search, page: 1 }
    void load()
}

function setScope(next: 'all' | 'mine'): void {
    scope.value = next
    query.value = { ...query.value, page: 1 }
    void load()
}

function select(asset: MediaAsset): void {
    selected.value = asset
}

function closeDrawer(): void {
    selected.value = null
}

function onAssetUpdated(updated: MediaAsset): void {
    if (selected.value?.id === updated.id) {
        selected.value = updated
    }
    const idx = assets.value.findIndex((a) => a.id === updated.id)
    if (idx >= 0) {
        assets.value = assets.value.map((a) => (a.id === updated.id ? updated : a))
    }
}

function onAssetDeleted(id: string): void {
    assets.value = assets.value.filter((a) => a.id !== id)
    total.value = Math.max(0, total.value - 1)
    selected.value = null
}

onMounted(load)

onBeforeUnmount(() => {
    // Bumping the id invalidates any pending response.
    requestId++
})
</script>

<template>
    <div class="flex flex-col gap-6 text-foreground">
        <header class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold">Media Archive</h2>
            <p class="text-sm text-muted-foreground">
                {{ total }} {{ total === 1 ? 'asset' : 'assets' }} in your archive.
            </p>
        </header>

        <MediaFilters
            :type="query.mediaType ?? ''"
            :search="query.search ?? ''"
            :scope="scope"
            @update:type="setType"
            @update:search="setSearch"
            @update:scope="setScope"
        />

        <div v-if="loading" class="text-sm text-muted-foreground">Loading media…</div>
        <div v-else-if="error" class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load media: {{ error }}
        </div>
        <MediaGrid v-else :assets="assets" @select="select" />

        <MediaDetailDrawer
            v-if="selected"
            :asset="selected"
            :host-context="hostContext"
            @close="closeDrawer"
            @updated="onAssetUpdated"
            @deleted="onAssetDeleted"
        />

        <div class="hidden">
            <Image class="h-4 w-4" />
            <FileAudio class="h-4 w-4" />
            <FileVideo class="h-4 w-4" />
            <FileText class="h-4 w-4" />
            <Search class="h-4 w-4" />
        </div>
    </div>
</template>
