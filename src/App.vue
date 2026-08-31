<script setup lang="ts">
/**
 * App.vue — Media Archive plugin shell.
 *
 * Owns:
 *  - the page/grid state (assets, loading, error, total, query)
 *  - the scope chip row state (visible principals, group labels, the
 *    single-pick filter)
 *  - the imperative route tracking (`router.afterEach`) so card clicks
 *    flip between the grid and the asset detail page without a remount
 *
 * The plugin is mounted as a leaf under `/apps/media-archive`; the host
 * router does not register a child route for `asset/:id`. We read the
 * current path reactively and toggle between grid and detail. Browser
 * back/forward, hard refresh, and URL sharing all work because the URL
 * is the source of truth — see `lib/route-detection.ts`.
 *
 * Scope filter: see `MediaFilters.vue` for the chip row visuals; the
 * backend contract is `GET /api/v1/media?principal_id=…` (repeatable),
 * intersected server-side with the caller's visible principals by
 * `MediaArchiveController::applyPrincipalScope()`.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FileAudio, FileVideo, FileText, Image, Search, Upload } from 'lucide-vue-next'
import type { PluginHostContext } from './shims'
import type {
    MediaAsset,
    MediaGroup,
    MediaListQuery,
    MediaListResponse,
    MediaPrincipal,
    MediaType,
} from './types'
import { extractAssetId } from './lib/route-detection'
import MediaGrid from './components/MediaGrid.vue'
import MediaFilters from './components/MediaFilters.vue'
import MediaUploadDialog from './components/MediaUploadDialog.vue'
import MediaDetailPage from './pages/MediaDetailPage.vue'

import './style.css'

/** `null` is the "ALL" pick — see `MediaListQuery` for the semantics. */
type SelectedScope = number | null

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

/**
 * Selected principal id for the scope chip row. `null` is "ALL" — we
 * pass every visible principal id to the API so the user's uploads
 * plus every group they belong to surface. A number is a single
 * principal (the user's user-principal for "My Media", a group's
 * group-principal for "Group X").
 */
const selectedScope = ref<SelectedScope>(null)

/**
 * Principals the caller can act as. Seeded from `GET /principals/me`
 * (the user's user-principal + every group-principal of which they're a
 * member). The full shape carries the `type: 'user' | 'group'`
 * discriminator — `MediaFilters` needs that to label the user-principal
 * chip `My Media` rather than `Group #${id}`. The values come from
 * spora-core and are safe to send back without re-intersecting — the
 * controller does its own `visiblePrincipalIds()` intersection as the
 * last line of defence.
 */
const visiblePrincipals = ref<MediaPrincipal[]>([])

/**
 * Group labels keyed by principal id (NOT group id — the controller's
 * principal filter takes principal ids, so we look up via the
 * `principal_id` field on each `MediaGroup`). Empty until
 * `GET /groups` resolves; the chip row falls back to `Group #${id}`
 * while the lookup is in flight.
 */
const groupLabelsByPrincipalId = ref<Record<number, string>>({})

/** Tracks whether the scope-bootstrap fetch is still pending. */
const scopeLoading = ref(false)

const total = ref(0)

/**
 * Upload dialog state. The header button flips this open; the dialog's
 * `defaultPrincipalId` snaps from `selectedScope` so the upload lands
 * in the same scope the operator was already browsing. Subsequent
 * scope chip changes don't retroactively change the dialog's
 * selection — the dialog owns its own state from open-to-close.
 */
const uploadDialogOpen = ref(false)

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

/**
 * Translate the single-pick `selectedScope` into the repeated-key wire
 * shape the controller consumes.
 *
 * - `null`  → every visible principal id (`ALL`)
 * - number  → just that principal id (`My Media` / `Group X`)
 *
 * Returning an empty array is safe: `URLSearchParams` skips empties
 * and the controller treats `?principal_id=` (no values) the same as
 * no `?principal_id=` at all — i.e. it falls back to the legacy
 * `agentOwnerUserId` ownership union.
 */
function principalIdsForRequest(): number[] {
    if (selectedScope.value !== null) {
        return [selectedScope.value]
    }
    return visiblePrincipals.value.map((p) => p.id)
}

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
        for (const id of principalIdsForRequest()) {
            // Use the `principal_id[]` array form so PHP's `parse_str`
            // (which Symfony uses internally) preserves every value.
            // The plain `principal_id=` form collapses repeated scalar
            // keys to the LAST one — meaning the `ALL` chip (which
            // sends user-principal + every group-principal) silently
            // dropped everything except the last group, so the user's
            // own media (owned by the user-principal id) never surfaced.
            // The controller reads `principal_id` regardless of the
            // `[]` suffix because PHP strips it during parsing.
            params.append('principal_id[]', String(id))
        }
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

/**
 * Pull the caller's visible principals + the group list in parallel so
 * the scope chip row can render labels as soon as the plugin mounts.
 *
 * Both calls are best-effort: a transient failure (group list 404 on
 * an installation without the Groups feature, say) leaves the chip
 * row in the empty-label state but does not block the grid. The grid
 * still gets a working `principalIds` filter via `visiblePrincipalIds`,
 * which is fetched independently from `/principals/me`.
 */
async function bootstrapScope(): Promise<void> {
    scopeLoading.value = true
    try {
        const [principals, groups] = await Promise.all([
            api.value
                .get<{ principals: MediaPrincipal[] }>('/principals/me')
                .then((r) => r.principals ?? [])
                .catch(() => [] as MediaPrincipal[]),
            api.value
                .get<{ groups: MediaGroup[] }>('/groups')
                .then((r) => r.groups ?? [])
                .catch(() => [] as MediaGroup[]),
        ])
        if (principals.length === 0) {
            visiblePrincipals.value = []
            groupLabelsByPrincipalId.value = {}
            return
        }
        visiblePrincipals.value = principals
        // Index labels by principal id (not group id) so the chip
        // picker can resolve a name via the principal it carries.
        const labels: Record<number, string> = {}
        for (const g of groups) {
            if (g.principal_id !== null) {
                labels[g.principal_id] = g.name
            }
        }
        groupLabelsByPrincipalId.value = labels
    } finally {
        scopeLoading.value = false
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

function setScope(next: SelectedScope): void {
    selectedScope.value = next
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

/**
 * Open the upload modal. Triggered from the header "Upload" button
 * AND from the grid's empty-state CTA via `MediaGrid`'s `upload-click`
 * event. The grid-to-header handoff keeps the trigger colocated with
 * the affordance that introduced it (a header button for the active
 * scope; a CTA when the grid is empty).
 */
function openUploadDialog(): void {
    uploadDialogOpen.value = true
}

/**
 * Dialog confirms an upload completed. Re-fetching is cheaper than
 * splicing the asset into the existing `assets` array because the
 * serializer's `derivatives` field, principal rewrite, and pagination
 * are all server-side concerns; diffing those locally would just
 * hand-roll a smaller `load()`.
 */
async function onUploaded(_asset: MediaAsset): Promise<void> {
    await load()
}

let unregisterAfterEach: (() => void) | null = null

onMounted(async () => {
    // Await the scope bootstrap so the initial load() call carries
    // the correct `principal_id` set — racing the two would silently
    // emit a request without the filter on the very first paint
    // (bootstrapScope's `visiblePrincipalIds` would still be empty).
    await bootstrapScope()
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
    <div id="spora-plugin-media-archive">
        <MediaDetailPage
            v-if="isOnDetailPage && activeAssetId !== null"
            :asset-id="activeAssetId"
            :host-context="hostContext"
            @updated="onAssetUpdated"
            @deleted="onAssetDeleted"
        />
        <div v-else class="flex flex-col gap-6 text-foreground" data-testid="media-archive-grid-view">
            <header class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                    <h2 class="text-lg font-semibold">Media Archive</h2>
                    <button
                        type="button"
                        :disabled="visiblePrincipals.length === 0"
                        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="media-archive-upload-button"
                        @click="openUploadDialog"
                    >
                        <Upload class="h-3.5 w-3.5" />
                        Upload
                    </button>
                </div>
                <p class="text-sm text-muted-foreground">
                    {{ total }} {{ total === 1 ? 'asset' : 'assets' }} in your archive.
                </p>
            </header>

            <MediaFilters
                :type="query.mediaType ?? ''"
                :search="query.search ?? ''"
                :principals="visiblePrincipals"
                :selected-scope="selectedScope"
                :group-labels="groupLabelsByPrincipalId"
                @update:type="setType"
                @update:search="setSearch"
                @update:scope="setScope"
            />

            <div v-if="loading" class="text-sm text-muted-foreground">Loading media…</div>
            <div v-else-if="error" class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load media: {{ error }}
            </div>
            <MediaGrid v-else :assets="assets" @select="select" @upload-click="openUploadDialog" />

            <MediaUploadDialog
                v-if="uploadDialogOpen"
                :host-context="hostContext"
                :principals="visiblePrincipals"
                :group-labels="groupLabelsByPrincipalId"
                :default-principal-id="selectedScope"
                @uploaded="onUploaded"
                @close="uploadDialogOpen = false"
            />

            <div class="hidden">
                <Image class="h-4 w-4" />
                <FileAudio class="h-4 w-4" />
                <FileVideo class="h-4 w-4" />
                <FileText class="h-4 w-4" />
                <Search class="h-4 w-4" />
                <Upload class="h-4 w-4" />
            </div>
        </div>
    </div>
</template>
