<script setup lang="ts">
/**
 * MediaToast — the panel's "it worked" line.
 *
 * The detail page had its own; the grid's bulk actions need the same
 * thing, so it is one component. `<output>` because it reports the
 * result of an action the operator just took.
 */
defineProps<{
    message: string | null
}>()
</script>

<template>
    <output
        v-if="message"
        aria-live="polite"
        class="pointer-events-none fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg"
        data-testid="media-toast"
    >
        {{ message }}
    </output>
</template>
