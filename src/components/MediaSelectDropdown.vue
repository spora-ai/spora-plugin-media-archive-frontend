<script setup lang="ts">
/**
 * MediaSelectDropdown — a dropdown that chooses one value.
 *
 * The style is the one the Custom Skills panel already uses: a bordered
 * `h-8` control with a chevron, so the two panels read as one app. A chip
 * row reads as a *filter*, and a filter does not say "everything below
 * this belongs to what I picked".
 *
 * The panel is purely presentational: it emits the chosen value and never
 * touches the API client.
 */
import { computed } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { useDropdownMenu } from '../composables/useDropdownMenu'

export interface MediaSelectOption {
    value: string
    label: string
}

const props = withDefaults(defineProps<{
    /**
     * The options, in the order they are listed. The first one is not
     * special — the unfiltered state is one of the options.
     */
    options: MediaSelectOption[]
    /**
     * The chosen value. An empty string means "no choice made".
     */
    modelValue: string
    /**
     * Test hook for the trigger and the menu.
     */
    testid?: string
}>(), {
    testid: '',
})

const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void
}>()

const { open, root, toggle } = useDropdownMenu()

const currentLabel = computed(() => {
    const found = props.options.find((option) => option.value === props.modelValue)
    return found?.label ?? props.options[0]?.label ?? ''
})

function choose(value: string): void {
    emit('update:modelValue', value)
}
</script>

<template>
    <div ref="root" class="relative">
        <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background pl-2.5 pr-2 text-xs font-medium transition-colors hover:bg-muted/50"
            aria-haspopup="true"
            :aria-expanded="open"
            :data-testid="testid ? `${testid}-toggle` : undefined"
            @click.stop="toggle"
        >
            <span class="max-w-[9rem] truncate">{{ currentLabel }}</span>
            <ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        <div
            v-if="open"
            class="absolute left-0 top-9 z-40 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            role="menu"
            data-media-menu
            :data-testid="testid ? `${testid}-menu` : undefined"
        >
            <button
                v-for="option in options"
                :key="option.value"
                type="button"
                role="menuitemradio"
                :aria-checked="option.value === modelValue"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                :class="option.value === modelValue ? 'bg-muted ring-1 ring-inset ring-border' : ''"
                :data-testid="testid ? `${testid}-option-${option.value || 'all'}` : undefined"
                @click="choose(option.value)"
            >
                <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                <Check
                    v-if="option.value === modelValue"
                    class="h-3.5 w-3.5 shrink-0"
                />
            </button>
        </div>
    </div>
</template>
