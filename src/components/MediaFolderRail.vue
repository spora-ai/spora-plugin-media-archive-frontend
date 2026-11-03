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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Folder, FolderPlus, FolderTree, Inbox, Users, X } from 'lucide-vue-next'
import type { MediaFolderFilter, MediaPrincipal, ScopedMediaFolder } from '../types'
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
     * Which slice of the library the listing shows: everything, one
     * folder, or the assets filed in no folder.
     */
    selected?: MediaFolderFilter
    /**
     * Whether a card is being dragged over the panel. The rows then
     * read as drop targets.
     */
    dragActive?: boolean
    /**
     * The message of a refused filing, shown under the heading. The
     * grid's own error block is for a listing that failed to load, so a
     * dropped card that the server refused needs its own line.
     */
    error?: string | null
}>(), {
    myMediaLabel: null,
    folders: () => [],
    selected: () => ({ kind: 'all' }),
    dragActive: false,
    error: null,
})

const emit = defineEmits<{
    (event: 'update:scope', value: number | null): void
    (event: 'update:selected', value: MediaFolderFilter): void
    (event: 'new-folder'): void
    (event: 'close'): void
    /**
     * A card was dropped on a folder — the folder id, or `null` for the
     * tree's root, which takes the asset out of its folder.
     */
    (event: 'file-asset', folderId: string | null): void
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

/**
 * Whether a folder row is the selected one.
 */
function isSelected(folderId: string): boolean {
    return props.selected.kind === 'folder' && props.selected.id === folderId
}

function folderCount(principalId: number): number {
    return props.folders.filter((folder) => folder.principal_id === principalId).length
}

/**
 * The row the pointer is over, so it can say so.
 *
 * The drag itself is the browser's: the card sets the asset id as the
 * drag data, and a row that cancels `dragover` is what makes the drop
 * land there.
 */
const dropTargetId = ref<string | null>(null)

function onDragOver(event: DragEvent, folderId: string | null): void {
    // Cancelling `dragover` is what tells the browser the row accepts
    // the drop.
    event.preventDefault()
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
    }
    if (dropTargetId.value !== folderId) {
        dropTargetId.value = folderId
    }
}

function onDragLeave(folderId: string | null): void {
    if (dropTargetId.value === folderId) {
        dropTargetId.value = null
    }
}

function onDrop(event: DragEvent, folderId: string | null): void {
    event.preventDefault()
    dropTargetId.value = null
    emit('file-asset', folderId)
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

        <p
            v-if="error !== null"
            class="pb-2 text-[11px] text-destructive"
            data-testid="media-rail-error"
        >
            {{ error }}
        </p>

        <div
            class="min-h-0 flex-1 overflow-y-auto"
            :class="dragActive ? 'rounded-lg ring-1 ring-dashed ring-primary/40' : ''"
        >
            <button
                type="button"
                class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                :class="selected.kind === 'all' ? 'bg-muted font-medium' : ''"
                :aria-pressed="selected.kind === 'all'"
                data-testid="media-folder-root"
                @click="emit('update:selected', { kind: 'all' })"
                @dragover="onDragOver($event, null)"
                @dragleave="onDragLeave(null)"
                @drop="onDrop($event, null)"
            >
                <FolderTree
                    class="h-3.5 w-3.5 shrink-0"
                    :class="selected.kind === 'all' ? 'text-primary' : 'text-muted-foreground'"
                />
                <span class="flex-1">{{ t('All media') }}</span>
            </button>

            <!--
              The pile that belongs to no folder. It is a filter, not a
              drop target: dropping a card here would take it out of its
              folder, which is what the row above already does.
            -->
            <button
                type="button"
                class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                :class="selected.kind === 'unfiled' ? 'bg-muted font-medium' : ''"
                :aria-pressed="selected.kind === 'unfiled'"
                data-testid="media-folder-unfiled"
                @click="emit('update:selected', { kind: 'unfiled' })"
            >
                <Inbox
                    class="h-3.5 w-3.5 shrink-0"
                    :class="selected.kind === 'unfiled' ? 'text-primary' : 'text-muted-foreground'"
                />
                <span class="flex-1">{{ t('All media without a folder') }}</span>
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
                    :class="[
                        isSelected(row.folder.id) ? 'bg-muted font-medium' : '',
                        dropTargetId === row.folder.id ? 'bg-primary/10 ring-1 ring-primary' : '',
                    ]"
                    :style="{ paddingLeft: `${0.75 + row.depth * 0.9}rem` }"
                    :aria-pressed="isSelected(row.folder.id)"
                    :data-testid="`media-folder-${row.folder.id}`"
                    :data-folder-path="row.folder.path"
                    @click="emit('update:selected', { kind: 'folder', id: row.folder.id })"
                    @dragover="onDragOver($event, row.folder.id)"
                    @dragleave="onDragLeave(row.folder.id)"
                    @drop="onDrop($event, row.folder.id)"
                >
                    <Folder
                        class="h-3.5 w-3.5 shrink-0"
                        :class="isSelected(row.folder.id) ? 'text-primary' : 'text-muted-foreground'"
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
