<script setup lang="ts">
/**
 * MediaFolderPicker — pick one folder out of a tree.
 *
 * A `<select>` lists the folders flat, so a folder called "2026" under
 * "Corporate" is indistinguishable from one under "Templates" — and
 * filing an asset in the wrong one is the kind of mistake nobody sees
 * until the library is a mess. The picker draws the tree the folders'
 * `parent_id` describes, indented, so the hierarchy is visible where the
 * choice is made.
 *
 * Both places that file an asset into a folder use it — the detail
 * page's picker and the upload dialog's — so the two offer the same
 * tree, and a fix to one is a fix to the other.
 *
 * The rows carry the folder's asset count, because the operator is
 * choosing where a file belongs, and the count says how much is already
 * filed in each one.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ChevronDown, Folder, FolderTree } from 'lucide-vue-next'
import type { MediaFolder } from '../types'
import { buildFolderTree, flattenFolderTree } from '../lib/folder-tree'
import { useDropdownMenu } from '../composables/useDropdownMenu'

const props = withDefaults(defineProps<{
    /**
     * The folders to choose from, flat. The tree is built from them, so
     * the caller hands over one principal's folders — a folder of
     * another principal is refused by the server.
     */
    folders: MediaFolder[]
    /**
     * The chosen folder id. `null` means the root: no folder.
     */
    modelValue: string | null
    /**
     * The trigger's accessible name. The trigger is a button, so it
     * carries the name itself — a `<label for>` would have nothing to
     * point at.
     */
    label?: string
    disabled?: boolean
    /**
     * Test hook for the trigger and the menu.
     */
    testid?: string
}>(), {
    label: '',
    disabled: false,
    testid: 'folder-picker',
})

const emit = defineEmits<{
    (event: 'update:modelValue', value: string | null): void
}>()

const { t } = useI18n()
const { open, root, toggle, close } = useDropdownMenu()

/**
 * The tree, flattened so the markup can indent it without recursing.
 */
const rows = computed(() => flattenFolderTree(buildFolderTree(props.folders)))

/**
 * The chosen folder, or `null` when the root is chosen.
 *
 * A chosen id that resolves to no folder is a folder the panel cannot
 * see — the asset is filed in one, but the operator's scope does not
 * list it. It is listed on its own row rather than hidden, so the
 * operator sees where the asset actually is.
 */
const chosen = computed<MediaFolder | null>(() => {
    if (props.modelValue === null) {
        return null
    }
    return props.folders.find((folder) => folder.id === props.modelValue) ?? null
})

const unresolved = computed(() => props.modelValue !== null && chosen.value === null)

/**
 * What the trigger shows.
 *
 * The path, not the name: the name alone cannot say whether "2026" is
 * the one under "Corporate" or under "Templates", and the trigger is
 * the only thing left on screen once the menu is closed.
 */
const currentLabel = computed(() => {
    if (props.modelValue === null) {
        return t('No folder')
    }
    if (chosen.value === null) {
        return t('Unknown folder')
    }
    return chosen.value.path.replace(/^\//, '')
})

function choose(value: string | null): void {
    // The menu closes on the choice: the pick is the answer, and a menu
    // that stays open over the panel it just changed hides the result.
    close()
    emit('update:modelValue', value)
}
</script>

<template>
    <div ref="root" class="relative">
        <button
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="disabled"
            :aria-label="label === '' ? undefined : label"
            aria-haspopup="true"
            :aria-expanded="open"
            :data-testid="testid ? `${testid}-toggle` : undefined"
            @click.stop="toggle"
        >
            <span class="flex min-w-0 items-center gap-1.5">
                <Folder class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate">{{ currentLabel }}</span>
            </span>
            <ChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>

        <div
            v-if="open"
            class="absolute left-0 top-full z-40 mt-1 w-64 max-h-64 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-xl"
            role="menu"
            data-media-menu
            :data-testid="testid ? `${testid}-menu` : undefined"
        >
            <button
                type="button"
                role="menuitemradio"
                :aria-checked="modelValue === null"
                class="flex w-full items-center gap-2 py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted"
                :class="modelValue === null ? 'bg-muted font-medium' : ''"
                :style="{ paddingLeft: '0.75rem' }"
                :data-testid="testid ? `${testid}-option-root` : undefined"
                @click="choose(null)"
            >
                <FolderTree class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1 truncate">{{ t('No folder') }}</span>
                <Check v-if="modelValue === null" class="h-3.5 w-3.5 shrink-0 text-primary" />
            </button>

            <button
                v-if="unresolved"
                type="button"
                role="menuitemradio"
                aria-checked="true"
                class="flex w-full items-center gap-2 py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted"
                :style="{ paddingLeft: '0.75rem' }"
                :data-testid="testid ? `${testid}-option-unresolved` : undefined"
                @click="choose(modelValue)"
            >
                <Folder class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1 truncate">{{ t('Unknown folder') }}</span>
                <Check class="h-3.5 w-3.5 shrink-0 text-primary" />
            </button>

            <button
                v-for="row in rows"
                :key="row.folder.id"
                type="button"
                role="menuitemradio"
                :aria-checked="modelValue === row.folder.id"
                class="flex w-full items-center gap-2 py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted"
                :class="modelValue === row.folder.id ? 'bg-muted font-medium' : ''"
                :style="{ paddingLeft: `${0.75 + row.depth * 0.9}rem` }"
                :data-testid="testid ? `${testid}-option-${row.folder.id}` : undefined"
                @click="choose(row.folder.id)"
            >
                <Folder class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1 truncate">{{ row.folder.name }}</span>
                <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {{ row.folder.asset_count }}
                </span>
                <Check v-if="modelValue === row.folder.id" class="h-3.5 w-3.5 shrink-0 text-primary" />
            </button>
        </div>
    </div>
</template>
