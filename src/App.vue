<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Image, FileAudio, FileVideo, FileText, Search } from 'lucide-vue-next'
import type { PluginHostContext } from './shims'
import type { MediaAsset, MediaListQuery, MediaListResponse, MediaType } from './types'
import { extractAssetId } from './lib/route-detection'
import MediaGrid from './components/MediaGrid.vue'
import MediaFilters from './components/MediaFilters.vue'
import MediaDetailPage from './pages/MediaDetailPage.vue'

import './style.css'

const props = defineProps<{ hostContext: PluginHostContext }>()

const api = computed(() => props.hostContext.api)
// Listen to host navigations imperatively via `router.afterEach`. The
// alternative — reading `router.currentRoute.value` reactively in a
// `watch` — fails because the plugin and the host ship separate `vue`
// packages: when Vue wraps `hostContext` in `reactive()` for the
// plugin's props, the host's `shallowRef` ends up behind a reactive
// proxy whose `.value` getter doesn't subscribe to the ref's
// internal dep list. `afterEach` is an imperative callback fired from
// Vue Router's own nav pipeline, so it sidesteps reactivity entirely.
// The `currentRoute.value.path` read for the initial value works
// because it only reads once at mount.
const routePath = ref<string>(
    props.hostContext.router?.currentRoute?.value?.path ?? '/apps/media-archive',
)
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

/**
 * The plugin is mounted as a leaf under `/apps/media-archive`; the host
 * router does not register a child route for `asset/:id`. We read the
 * current path reactively and toggle between grid and detail. Browser
 * back/forward, hard refresh, and URL sharing all work because the URL
 * is the source of truth — see `lib/route-detection.ts`.
 */
const activeAssetId = computed(() => extractAssetId(routePath.value))
const isOnDetailPage = computed(() => activeAssetId.value !== null)

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

/**
 * Card click: push the URL to the asset detail route. The host router
 * does not need to know about this sub-route — see
 * `lib/route-detection.ts` for the path-based detection.
 */
function select(asset: MediaAsset): void {
    const router = props.hostContext.router
    if (router !== null) {
        void router.push(`/apps/media-archive/asset/${asset.id}`)
    }
}

function onAssetUpdated(updated: MediaAsset): void {
    const idx = assets.value.findIndex((a) => a.id === updated.id)
    if (idx >= 0) {
        assets.value = assets.value.map((a) => (a.id === updated.id ? updated : a))
    }
}

function onAssetDeleted(id: string): void {
    assets.value = assets.value.filter((a) => a.id !== id)
    total.value = Math.max(0, total.value - 1)
    // After deletion the URL still points at the now-gone asset; the
    // detail page would render a 404 from the API. Only redirect when
    // we're actually on a detail URL — deletion can also fire from a
    // future "delete from grid" affordance where redirecting would be
    // a no-op.
    if (isOnDetailPage.value) {
        // Pulled into a local so the `vue/no-mutating-props` lint rule
        // (which walks the prop chain on the access) doesn't fire on
        // the chained `.push()`. Same pattern as `select()` above.
        const router = props.hostContext.router
        if (router !== null) {
            void router.push('/apps/media-archive')
        }
    }
}

let unregisterAfterEach: (() => void) | null = null

onMounted(() => {
    if (!isOnDetailPage.value) {
        void load()
    }
    const router = props.hostContext.router as unknown as
        | { afterEach: (cb: (to: { path: string }) => void) => () => void }
        | null
    if (router !== null && typeof router.afterEach === 'function') {
        unregisterAfterEach = router.afterEach((to) => {
            routePath.value = to.path
        })
    }
})

// Refresh the grid whenever the user navigates back from a detail page.
watch(activeAssetId, (id) => {
    if (id === null) {
        void load()
    }
})

onBeforeUnmount(() => {
    unregisterAfterEach?.()
    // Bumping the id invalidates any pending response.
    requestId++
})
</script>

<template>
    <MediaDetailPage
        v-if="isOnDetailPage && activeAssetId !== null"
        :asset-id="activeAssetId"
        :host-context="hostContext"
        @updated="onAssetUpdated"
        @deleted="onAssetDeleted"
    />
    <div v-else class="flex flex-col gap-6 text-foreground" data-testid="media-archive-grid-view">
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

        <div class="hidden">
            <Image class="h-4 w-4" />
            <FileAudio class="h-4 w-4" />
            <FileVideo class="h-4 w-4" />
            <FileText class="h-4 w-4" />
            <Search class="h-4 w-4" />
        </div>
    </div>
</template>