<script setup lang="ts">
/**
 * MediaFolderRail — whose folders, and which one.
 *
 * A folder belongs to a principal: `media_folders.principal_id` is not
 * nullable, and the server intersects the folder filter with the
 * principal scope (`MediaArchiveService::applyFolderFilter`) — a folder
 * owned outside the scope yields no rows and no hint that it exists. So
 * the tree cannot be a free-floating facet beside the principal; it *is*
 * the principal's own namespace, and the panel shows that ownership
 * structurally.
 *
 * The scope dropdown therefore sits at the top of the rail, above the
 * "Folders" heading: it governs the tree below it *and* the grid beside
 * it. In one principal's scope the tree is that principal's folders. In
 * the "all principals" scope the tree is grouped — each principal a
 * heading, its folders under it — because two principals may own folders
 * with the same name.
 *
 * The component is purely presentational: it emits the chosen scope, the
 * chosen folder, and the request to create one.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Folder, FolderPlus, FolderTree, Users, X } from 'lucide-vue-next'
import type { MediaPrincipal, ScopedMediaFolder } from '../types'
import { buildFolderTree, flattenFolderTree } from '../lib/folder-tree'
import MediaScopeSelect from './MediaScopeSelect.vue'

const props = withDefaults(defineProps<{
    principals: MediaPrincipal[]
    selectedScope: number | null
    groupLabels: Record<number, string>
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
}>(), {
    myMediaLabel: null,
    folders: () => [],
    selectedFolderId: null,
})

const emit = defineEmits<{
    (event: 'update:scope', value: number | null): void
    (event: 'update:folderId', value: string | null): void
    (event: 'new-folder'): void
    (event: 'close'): void
}>()

const { t } = useI18n()

interface RailGroup {
    /**
     * The principal whose folders the group holds. `null` for the single
     * group of a one-principal scope, which needs no heading.
     */
    principal: MediaPrincipal | null
    rows: ReturnType<typeof flattenFolderTree>
}

function principalLabel(principal: MediaPrincipal): string {
    if (principal.type === 'user') {
        return props.myMediaLabel
            ? t('My Media ({name})', { name: props.myMediaLabel })
            : t('My Media')
    }
    return props.groupLabels[principal.id] ?? t('Group #{id}', { id: principal.id })
}

/**
 * The tree, grouped by the principal that owns the folders.
 *
 * One principal's scope is one group without a heading — the scope
 * dropdown above already says whose tree this is. The "all principals"
 * scope groups, because the same folder name may belong to two
 * principals.
 */
const groups = computed<RailGroup[]>(() => {
    const owned = (principalId: number): ScopedMediaFolder[] =>
        props.folders.filter((folder) => folder.principal_id === principalId)

    if (props.selectedScope !== null) {
        return [{
            principal: null,
            rows: flattenFolderTree(buildFolderTree(owned(props.selectedScope))),
        }]
    }

    return props.principals.map((principal) => ({
        principal,
        rows: flattenFolderTree(buildFolderTree(owned(principal.id))),
    }))
})

/**
 * Whether the tree groups by principal — only in the "all principals"
 * scope, and only when there is more than one principal to group by.
 */
const grouped = computed(() => props.selectedScope === null && props.principals.length > 1)

function folderCount(principalId: number): number {
    return props.folders.filter((folder) => folder.principal_id === principalId).length
}
</script>

<template>
    <div class="flex h-full flex-col">
        <div class="flex items-start gap-2 pb-3">
            <div class="min-w-0 flex-1">
                <MediaScopeSelect
                    :principals="principals"
                    :selected-scope="selectedScope"
                    :group-labels="groupLabels"
                    :my-media-label="myMediaLabel"
                    @update:scope="emit('update:scope', $event)"
                />
            </div>
            <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
                data-testid="media-rail-close"
                :aria-label="t('Close the folders')"
                @click="emit('close')"
            >
                <X class="h-4 w-4" />
            </button>
        </div>

        <div class="flex items-center justify-between gap-2 pb-2">
            <h2 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {{ t('Folders') }}
            </h2>
            <button
                v-if="principals.length > 0"
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[11px] font-medium transition-colors hover:bg-muted/50"
                data-testid="media-new-folder-button"
                @click="emit('new-folder')"
            >
                <FolderPlus class="h-3.5 w-3.5" />
                <span>{{ t('New folder') }}</span>
            </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
            <button
                type="button"
                class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                :class="selectedFolderId === null ? 'bg-muted font-medium' : ''"
                :aria-pressed="selectedFolderId === null"
                data-testid="media-folder-root"
                @click="emit('update:folderId', null)"
            >
                <FolderTree
                    class="h-3.5 w-3.5 shrink-0"
                    :class="selectedFolderId === null ? 'text-primary' : 'text-muted-foreground'"
                />
                <span class="flex-1">{{ t('All media') }}</span>
            </button>

            <template v-for="group in groups" :key="group.principal?.id ?? 'scope'">
                <button
                    v-if="grouped && group.principal !== null"
                    type="button"
                    class="mt-2 flex w-full items-center gap-1.5 border-t border-border px-2 pb-1 pt-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    :data-testid="`media-rail-group-${group.principal.id}`"
                    @click="emit('update:scope', group.principal!.id)"
                >
                    <Users class="h-3 w-3 shrink-0" />
                    <span class="min-w-0 flex-1 truncate">{{ principalLabel(group.principal) }}</span>
                    <span class="shrink-0 text-[11px] font-normal tabular-nums">
                        {{ folderCount(group.principal.id) }}
                    </span>
                </button>

                <p
                    v-if="group.rows.length === 0"
                    class="px-2 pb-1 text-[11px] text-muted-foreground"
                    :class="grouped ? 'pl-7' : ''"
                    data-testid="media-folder-empty"
                >
                    {{ t('No folders') }}
                </p>

                <button
                    v-for="row in group.rows"
                    :key="row.folder.id"
                    type="button"
                    class="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted"
                    :class="selectedFolderId === row.folder.id ? 'bg-muted font-medium' : ''"
                    :style="{ paddingLeft: `${0.75 + row.depth * 0.9}rem` }"
                    :aria-pressed="selectedFolderId === row.folder.id"
                    :data-testid="`media-folder-${row.folder.id}`"
                    :data-folder-path="row.folder.path"
                    @click="emit('update:folderId', row.folder.id)"
                >
                    <Folder
                        class="h-3.5 w-3.5 shrink-0"
                        :class="selectedFolderId === row.folder.id ? 'text-primary' : 'text-muted-foreground'"
                    />
                    <span class="min-w-0 flex-1 truncate">{{ row.folder.name }}</span>
                    <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {{ row.folder.asset_count }}
                    </span>
                </button>
            </template>
        </div>
    </div>
</template>
