<script setup lang="ts">
/**
 * MediaScopeSelect — whose media the panel shows.
 *
 * The scope is not a filter: it decides *whose* folders the tree holds and
 * *whose* assets the grid lists. A chip row reads as a filter, and a filter
 * does not say "everything below this belongs to what I picked" — so this
 * is a dropdown, in the Custom Skills panel's style.
 *
 * It is rendered twice: full-width at the top of the folder rail, and
 * compact in the toolbar on a narrow screen, where the rail is a drawer
 * and the scope has to stay reachable while it is closed. Both copies are
 * the same control at two sizes — the parent owns the selection.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ChevronDown, User, Users } from 'lucide-vue-next'
import type { MediaPrincipal } from '../types'
import { useDropdownMenu } from '../composables/useDropdownMenu'

const props = withDefaults(defineProps<{
    principals: MediaPrincipal[]
    /**
     * The chosen principal id, or `null` for every principal the caller
     * can see.
     */
    selectedScope: number | null
    /**
     * Map of `groupPrincipalId → groupName`. Group rows come from
     * `GET /groups`, whose wire shape keys the principal id (not the
     * group id) — see `GroupDetailResource::toArray()` in spora-core.
     */
    groupLabels: Record<number, string>
    /**
     * Optional display-name suffix for the user-principal row, mirroring
     * the dashboard's `My Agents (${me.name})`.
     */
    myMediaLabel?: string | null
    /**
     * The toolbar-sized copy: the same control in one line.
     */
    compact?: boolean
}>(), {
    myMediaLabel: null,
    compact: false,
})

const emit = defineEmits<{
    (event: 'update:scope', value: number | null): void
}>()

const { t } = useI18n()
const { open, root, toggle } = useDropdownMenu()

/**
 * The label of a principal: "My Media" for the user-principal, the
 * group's name for a group-principal.
 */
function principalLabel(principal: MediaPrincipal): string {
    if (principal.type === 'user') {
        return props.myMediaLabel
            ? t('My Media ({name})', { name: props.myMediaLabel })
            : t('My Media')
    }
    return props.groupLabels[principal.id] ?? t('Group #{id}', { id: principal.id })
}

function principalKind(principal: MediaPrincipal): string {
    return principal.type === 'user' ? t('Personal') : t('Group')
}

const selectedPrincipal = computed(() =>
    props.principals.find((principal) => principal.id === props.selectedScope) ?? null,
)

const triggerLabel = computed(() =>
    selectedPrincipal.value === null
        ? t('All principals')
        : principalLabel(selectedPrincipal.value),
)

const triggerSubLabel = computed(() =>
    selectedPrincipal.value === null
        ? t('Everything you can see')
        : principalKind(selectedPrincipal.value),
)

function choose(scope: number | null): void {
    emit('update:scope', scope)
}
</script>

<template>
    <div ref="root" class="relative">
        <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-border bg-background text-left transition-colors hover:bg-muted/50"
            :class="compact
                ? 'h-8 pl-1.5 pr-2 text-xs font-medium'
                : 'w-full px-2 py-1.5'"
            aria-haspopup="listbox"
            :aria-expanded="open"
            data-testid="media-scope-toggle"
            @click.stop="toggle"
        >
            <span
                v-if="selectedPrincipal !== null && selectedPrincipal.type === 'user'"
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
            >
                <User class="h-3.5 w-3.5" />
            </span>
            <span
                v-else
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
            >
                <Users class="h-3.5 w-3.5" />
            </span>
            <span v-if="!compact" class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ triggerLabel }}</span>
                <span class="block truncate text-[11px] text-muted-foreground">{{ triggerSubLabel }}</span>
            </span>
            <span v-else class="max-w-[9rem] truncate">{{ triggerLabel }}</span>
            <ChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>

        <div
            v-if="open"
            class="absolute left-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            role="listbox"
            data-media-menu
            data-testid="media-scope-menu"
        >
            <button
                type="button"
                role="option"
                :aria-selected="selectedScope === null"
                class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
                :class="selectedScope === null ? 'bg-muted ring-1 ring-inset ring-border' : ''"
                data-testid="media-scope-option-all"
                @click="choose(null)"
            >
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Users class="h-3.5 w-3.5" />
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{{ t('All principals') }}</span>
                    <span class="block text-[11px] text-muted-foreground">{{ t('Everything you can see') }}</span>
                </span>
                <Check
                    v-if="selectedScope === null"
                    class="h-3.5 w-3.5 shrink-0"
                />
            </button>

            <button
                v-for="principal in principals"
                :key="principal.id"
                type="button"
                role="option"
                :aria-selected="selectedScope === principal.id"
                class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
                :class="selectedScope === principal.id ? 'bg-muted ring-1 ring-inset ring-border' : ''"
                :data-testid="`media-scope-option-${principal.id}`"
                @click="choose(principal.id)"
            >
                <span
                    v-if="principal.type === 'user'"
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
                >
                    <User class="h-3.5 w-3.5" />
                </span>
                <span
                    v-else
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                    <Users class="h-3.5 w-3.5" />
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{{ principalLabel(principal) }}</span>
                    <span class="block text-[11px] text-muted-foreground">{{ principalKind(principal) }}</span>
                </span>
                <Check
                    v-if="selectedScope === principal.id"
                    class="h-3.5 w-3.5 shrink-0"
                />
            </button>
        </div>
    </div>
</template>
