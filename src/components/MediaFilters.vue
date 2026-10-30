<script setup lang="ts">
/**
 * MediaFilters — type/kind pills, the dashboard-style scope chip row and
 * the folder tree.
 *
 * The scope chip row mirrors `spora-frontend/src/components/dashboard
 * /DashboardFilterChips.vue`: ALL / My Media / Group A / Group B / ...,
 * single-select, click-the-active-chip-to-clear. The `type: 'user' |
 * 'group'` discriminator the parent passes in is the only thing that lets
 * us label the user-principal as `My Media` instead of the
 * `Group #${id}` fallback.
 *
 * The folder tree is the third filter dimension: the tree's root is the
 * whole library, every folder hangs below its parent, and each folder
 * carries the number of assets filed directly in it. The parent owns the
 * folder list and the selection — this component only draws it.
 *
 * The component is purely presentational: it emits `update:scope` with
 * the chosen principal id (or `null` for ALL), `update:folderId` with
 * the chosen folder (or `null` for the tree's root) and `update:kind`
 * with the chosen mark, and never touches the API client. The parent
 * owns the `load()` call.
 *
 * The folder tree and the mark row are only offered when the parent
 * says the core has the folders release — see the `foldersSupported`
 * prop.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    Image,
    FileAudio,
    FileVideo,
    FileText,
    Search,
    User,
    LayoutGrid,
    Users,
    Folder,
    FolderTree,
    Package,
    LayoutTemplate,
    Lightbulb,
} from 'lucide-vue-next'
import type { MediaAssetKind, MediaPrincipal, MediaType, ScopedMediaFolder } from '../types'
import { buildFolderTree, flattenFolderTree } from '../lib/folder-tree'
import { useShowTemporaryToggle } from '../composables/useShowTemporaryToggle'

type Scope = number | null

interface ScopeChip {
    id: Scope
    label: string
    icon: typeof LayoutGrid
}

const props = withDefaults(defineProps<{
    type: MediaType | ''
    search: string
    /**
     * Full list of principals the caller can act as, as returned by
     * `GET /principals/me`. The `type` field drives the chip label —
     * `user` → "My Media", `group` → `groupLabels[p.id]` with a
     * `Group #${id}` fallback.
     */
    principals: MediaPrincipal[]
    selectedScope: Scope
    /**
     * Map of `groupPrincipalId → groupName`. Group rows come from
     * `GET /groups`, whose wire shape keys the principal id (not the
     * group id) — see `GroupDetailResource::toArray()` in spora-core.
     * Empty until the bootstrap fetch resolves; the chip row falls
     * back to `Group #${id}` while the lookup is in flight.
     */
    groupLabels: Record<number, string>
    /**
     * Optional display-name suffix for the user-principal chip.
     * Mirrors `DashboardFilterChips`'s `My Agents (${me.name})` —
     * when the host has the user's display name handy, we render
     * `My Media (${name})`, otherwise just `My Media`.
     */
    myMediaLabel?: string | null
    /**
     * The folders of the principals in scope, flat and ordered by path.
     * The tree is rebuilt from `parent_id` — see `lib/folder-tree.ts`.
     */
    folders?: ScopedMediaFolder[]
    /**
     * The selected folder id, or `null` for the tree's root (the whole
     * library).
     */
    selectedFolderId?: string | null
    /**
     * The selected mark, or `''` for every mark.
     */
    kind?: MediaAssetKind | ''
    /**
     * Whether the core carries the folders release.
     *
     * The folders endpoint, the `folder_id` column and the `kind` mark
     * ship together, so a core that predates them ignores `?kind=` — and
     * a filter the server ignores is worse than no filter. The parent
     * probes the folders endpoint and passes the answer here; the panel
     * then offers neither the tree nor the mark.
     */
    foldersSupported?: boolean
}>(), {
    myMediaLabel: null,
    folders: () => [],
    selectedFolderId: null,
    kind: '',
    foldersSupported: true,
})

const emit = defineEmits<{
    (event: 'update:type', value: MediaType | ''): void
    (event: 'update:search', value: string): void
    (event: 'update:scope', value: Scope): void
    (event: 'update:folderId', value: string | null): void
    (event: 'update:kind', value: MediaAssetKind | ''): void
}>()

const { t } = useI18n()

interface TypePill {
    value: MediaType | ''
    label: string
    icon: typeof Image
}

/**
 * `Audio` and `Video` are ordinary German words as well as English ones,
 * so they are left as they are — the catalogue has nothing to add to
 * them, and a German value identical to the key would be an untranslated
 * placeholder.
 */
const pills: TypePill[] = [
    { value: '', label: t('All'), icon: Search },
    { value: 'image', label: t('Images'), icon: Image },
    { value: 'audio', label: 'Audio', icon: FileAudio },
    { value: 'video', label: 'Video', icon: FileVideo },
    { value: 'document', label: t('Documents'), icon: FileText },
]

interface KindChip {
    value: MediaAssetKind | ''
    label: string
    icon: typeof Package
}

/**
 * The advisory mark (`media_assets.kind`). The vocabulary is closed —
 * core refuses anything else with a 422 — so the row lists exactly the
 * three marks plus the unfiltered state.
 */
const kindChips: KindChip[] = [
    { value: '', label: t('All'), icon: Search },
    { value: 'asset', label: t('Asset'), icon: Package },
    { value: 'template', label: t('Template'), icon: LayoutTemplate },
    { value: 'example', label: t('Example'), icon: Lightbulb },
]

const selected = computed(() => props.type)

/**
 * The label of a principal: "My Media" for the user-principal, the
 * group's name for a group-principal.
 *
 * The scope chips and the folder rows share it, so a folder row names
 * the same principal the chip above it does.
 */
function principalLabel(principal: MediaPrincipal): string {
    if (principal.type === 'user') {
        return props.myMediaLabel
            ? t('My Media ({name})', { name: props.myMediaLabel })
            : t('My Media')
    }
    return props.groupLabels[principal.id] ?? t('Group #{id}', { id: principal.id })
}

/**
 * ALL chip + one chip per principal. The user-principal is rendered
 * with the `My Media` label (no fallback) regardless of whether
 * `groupLabels` has an entry — using `groupLabels[id]` for every
 * principal silently demoted the user-principal to `Group #${id}`.
 */
const scopeChips = computed<ReadonlyArray<ScopeChip>>(() => {
    const out: ScopeChip[] = [{ id: null, label: t('All'), icon: LayoutGrid }]
    for (const principal of props.principals) {
        out.push({
            id: principal.id,
            label: principalLabel(principal),
            icon: principal.type === 'user' ? User : Users,
        })
    }
    return out
})

/**
 * The folder tree as a flat list of rows, each carrying its depth so
 * the markup can indent it without recursing.
 */
const folderRows = computed(() => flattenFolderTree(buildFolderTree(props.folders)))

/**
 * Whether the folder rows have to name their principal.
 *
 * A folder's `path` is unique per principal and not globally, so in the
 * ALL scope two principals may own a folder with the same name — and the
 * tree would show two identically labelled rows. A scope of one
 * principal holds that principal's folders only, so the label would be
 * noise there.
 */
const showFolderPrincipal = computed(() =>
    props.selectedScope === null
    && new Set(props.folders.map((folder) => folder.principal_id)).size > 1,
)

/**
 * The label of the principal that owns a folder.
 */
function folderPrincipalLabel(folder: ScopedMediaFolder): string {
    const principal = props.principals.find((candidate) => candidate.id === folder.principal_id)
    return principal === undefined
        ? t('Group #{id}', { id: folder.principal_id })
        : principalLabel(principal)
}

function isScopeActive(id: Scope): boolean {
    return props.selectedScope === id
}

function onScopeClick(id: Scope): void {
    // Single-select: clicking the active chip resets to ALL so the
    // user can dismiss the filter in one click (matches the
    // dashboard's flag-chip toggle behaviour).
    if (isScopeActive(id)) {
        emit('update:scope', null)
        return
    }
    emit('update:scope', id)
}

function isFolderActive(id: string): boolean {
    return props.selectedFolderId === id
}

function onFolderClick(id: string): void {
    emit('update:folderId', id)
}

function onRootClick(): void {
    emit('update:folderId', null)
}

/**
 * "Include temporary files" toggle. Surfaced here because it's a list-
 * scoping concern (mirrors the dashboard's flag-chip row) and the
 * state is localStorage-persisted — see the composable's docblock.
 * Default is OFF: the controller already filters temp rows out, and
 * flipping the switch is an opt-in to surface them. The parent
 * (`App.vue`) watches the same ref to reload the grid.
 */
const { showTemporary, toggle: toggleShowTemporary } = useShowTemporaryToggle()
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
            <div class="flex flex-wrap gap-2" data-testid="media-type-pills">
                <button
                    v-for="pill in pills"
                    :key="pill.value || 'all'"
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    :class="
                        selected === pill.value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    "
                    :data-testid="`media-type-${pill.value || 'all'}`"
                    @click="emit('update:type', pill.value)"
                >
                    <component :is="pill.icon" class="h-3.5 w-3.5" />
                    {{ pill.label }}
                </button>
            </div>
        </div>

        <div v-if="foldersSupported" class="flex flex-wrap items-center gap-2">
            <div class="flex flex-wrap gap-2" data-testid="media-kind-pills">
                <button
                    v-for="chip in kindChips"
                    :key="chip.value || 'all'"
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    :class="
                        kind === chip.value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    "
                    :data-testid="`media-kind-${chip.value || 'all'}`"
                    :aria-pressed="kind === chip.value"
                    @click="emit('update:kind', chip.value)"
                >
                    <component :is="chip.icon" class="h-3.5 w-3.5" />
                    {{ chip.label }}
                </button>
            </div>
        </div>

        <div
            v-if="scopeChips.length > 1"
            class="flex flex-wrap items-center gap-2"
            data-testid="media-scope-chips"
        >
            <button
                v-for="chip in scopeChips"
                :key="`scope-${chip.id ?? 'all'}`"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                :class="
                    isScopeActive(chip.id)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                "
                :data-scope="chip.id ?? 'all'"
                :data-testid="`media-scope-${chip.id ?? 'all'}`"
                :aria-pressed="isScopeActive(chip.id)"
                @click="onScopeClick(chip.id)"
            >
                <component :is="chip.icon" class="h-3.5 w-3.5" />
                {{ chip.label }}
            </button>
        </div>

        <div v-if="foldersSupported" class="flex flex-col gap-1" data-testid="media-folder-tree">
            <button
                type="button"
                class="inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                :class="
                    selectedFolderId === null
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                "
                data-testid="media-folder-root"
                :aria-pressed="selectedFolderId === null"
                @click="onRootClick"
            >
                <FolderTree class="h-3.5 w-3.5" />
                {{ t('All media') }}
            </button>

            <button
                v-for="row in folderRows"
                :key="row.folder.id"
                type="button"
                class="inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                :class="
                    isFolderActive(row.folder.id)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                "
                :style="{ paddingLeft: `${0.75 + row.depth * 0.9}rem` }"
                :data-testid="`media-folder-${row.folder.id}`"
                :data-folder-path="row.folder.path"
                :aria-pressed="isFolderActive(row.folder.id)"
                @click="onFolderClick(row.folder.id)"
            >
                <Folder class="h-3.5 w-3.5" />
                <span class="truncate">{{ row.folder.name }}</span>
                <span
                    v-if="showFolderPrincipal"
                    class="opacity-70"
                    data-testid="media-folder-principal"
                >
                    {{ folderPrincipalLabel(row.folder) }}
                </span>
                <span class="opacity-70">{{ row.folder.asset_count }}</span>
            </button>

            <p v-if="folderRows.length === 0" class="text-xs text-muted-foreground" data-testid="media-folder-empty">
                {{ t('No folders') }}
            </p>
        </div>

        <label class="relative block">
            <span class="sr-only">{{ t('Search') }}</span>
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                type="search"
                :value="search"
                :aria-label="t('Search')"
                :placeholder="t('Search prompts and tags…')"
                class="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="media-search"
                @input="emit('update:search', ($event.target as HTMLInputElement).value)"
            />
        </label>

        <label class="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
                type="checkbox"
                :checked="showTemporary"
                class="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                data-testid="media-show-temporary"
                @change="toggleShowTemporary"
            />
            {{ t('Include temporary files') }}
        </label>
    </div>
</template>
