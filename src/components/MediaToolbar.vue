<script setup lang="ts">
/**
 * MediaToolbar — the search box and the filters beside the grid.
 *
 * The panel used to stack four chip rows above the grid, so the library
 * started five rows down the page. The file type and the kind are
 * filters, and a filter is a dropdown: the Custom Skills panel already
 * uses the bordered `h-8` control with a chevron, so the two panels read
 * as one app.
 *
 * The scope is not a filter — it decides whose media this is — so it
 * lives in the folder rail. On a narrow screen the rail is a drawer, and
 * a drawer holds the scope, so the toolbar carries a compact copy of it:
 * the same control at one line, so the panel still says whose media it
 * shows while the drawer is closed.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderTree, CheckSquare, Search, Upload } from 'lucide-vue-next'
import type { MediaAssetKind, MediaPrincipal, MediaType } from '../types'
import { useShowTemporaryToggle } from '../composables/useShowTemporaryToggle'
import MediaScopeSelect from './MediaScopeSelect.vue'
import MediaSelectDropdown, { type MediaSelectOption } from './MediaSelectDropdown.vue'

withDefaults(defineProps<{
    type: MediaType | ''
    search: string
    kind: MediaAssetKind | ''
    /**
     * Whether the core carries the folders release. The `kind` mark
     * ships with it, so a core that predates both ignores `?kind=` — and
     * a filter the server ignores is worse than no filter.
     */
    foldersSupported?: boolean
    /**
     * Whether the folder rail is on screen. When it is not, the scope
     * has no other home and stays in the toolbar.
     */
    showRail?: boolean
    principals: MediaPrincipal[]
    selectedScope: number | null
    groupLabels: Record<number, string>
    myMediaLabel?: string | null
    /**
     * Whether the panel is in selection mode. The button that turns it
     * on is hidden while it is on — the selection bar carries the way
     * out.
     */
    selectionMode?: boolean
}>(), {
    foldersSupported: true,
    showRail: true,
    myMediaLabel: null,
    selectionMode: false,
})

const emit = defineEmits<{
    (event: 'update:type', value: MediaType | ''): void
    (event: 'update:search', value: string): void
    (event: 'update:kind', value: MediaAssetKind | ''): void
    (event: 'update:scope', value: number | null): void
    (event: 'upload-click'): void
    (event: 'open-folders'): void
    (event: 'toggle-selection'): void
}>()

const { t } = useI18n()

/**
 * `Audio` and `Video` are ordinary German words as well as English ones,
 * so they are left as they are — the catalogue has nothing to add to
 * them, and a German value identical to the key would be an untranslated
 * placeholder.
 */
const typeOptions = computed<MediaSelectOption[]>(() => [
    { value: '', label: t('All file types') },
    { value: 'image', label: t('Images') },
    { value: 'audio', label: 'Audio' },
    { value: 'video', label: 'Video' },
    { value: 'document', label: t('Documents') },
])

/**
 * The advisory mark (`media_assets.kind`). The vocabulary is closed —
 * core refuses anything else with a 422 — so the list holds exactly the
 * three marks plus the unfiltered state.
 */
const kindOptions = computed<MediaSelectOption[]>(() => [
    { value: '', label: t('All kinds') },
    { value: 'asset', label: t('Asset') },
    { value: 'template', label: t('Template') },
    { value: 'example', label: t('Example') },
])

/**
 * "Include temporary files" toggle. It is a list-scoping concern and the
 * state is localStorage-persisted — see the composable's docblock.
 * Default is OFF: the controller already filters temp rows out, and
 * flipping the switch is an opt-in to surface them. `App.vue` watches the
 * same ref to reload the grid.
 */
const { showTemporary, toggle: toggleShowTemporary } = useShowTemporaryToggle()
</script>

<template>
    <div class="flex flex-wrap items-center gap-2">
        <div class="relative order-first w-full sm:order-none sm:w-auto sm:min-w-[12rem] sm:flex-1">
            <!--
              Centred with `inset-y-0 my-auto` rather than
              `top-1/2 -translate-y-1/2`: the plugin ships no preflight, and
              Tailwind's transform utilities read variables its preflight
              defines — without them they silently do nothing. See
              `src/style.css`.
            -->
            <Search class="pointer-events-none absolute left-3 inset-y-0 my-auto h-4 w-4 text-muted-foreground" />
            <input
                type="search"
                :value="search"
                :aria-label="t('Search')"
                :placeholder="t('Search filenames, prompts, plugins…')"
                class="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                data-testid="media-search"
                @input="emit('update:search', ($event.target as HTMLInputElement).value)"
            />
        </div>

        <button
            v-if="showRail"
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted/50 lg:hidden"
            data-testid="media-rail-open"
            @click="emit('open-folders')"
        >
            <FolderTree class="h-3.5 w-3.5 text-muted-foreground" />
            <span>{{ t('Folders') }}</span>
        </button>

        <div :class="showRail ? 'lg:hidden' : ''">
            <MediaScopeSelect
                compact
                :principals="principals"
                :selected-scope="selectedScope"
                :group-labels="groupLabels"
                :my-media-label="myMediaLabel"
                @update:scope="emit('update:scope', $event)"
            />
        </div>

        <MediaSelectDropdown
            :options="typeOptions"
            :model-value="type"
            testid="media-type-select"
            @update:model-value="emit('update:type', $event as MediaType | '')"
        />

        <MediaSelectDropdown
            v-if="foldersSupported"
            :options="kindOptions"
            :model-value="kind"
            testid="media-kind-select"
            @update:model-value="emit('update:kind', $event as MediaAssetKind | '')"
        />

        <button
            v-if="!selectionMode"
            type="button"
            class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
            data-testid="media-selection-toggle"
            @click="emit('toggle-selection')"
        >
            <CheckSquare class="h-4 w-4" />
            <span>{{ t('Select') }}</span>
        </button>

        <button
            type="button"
            :disabled="principals.length === 0"
            class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="media-archive-upload-button"
            @click="emit('upload-click')"
        >
            <Upload class="h-4 w-4" />
            <span>{{ t('Upload') }}</span>
        </button>

        <label class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
                type="checkbox"
                :checked="showTemporary"
                class="h-3.5 w-3.5 rounded border-input"
                data-testid="media-show-temporary"
                @change="toggleShowTemporary"
            />
            <span>{{ t('Include temporary files') }}</span>
        </label>
    </div>
</template>
