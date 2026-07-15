<script setup lang="ts">
import { computed } from 'vue'
import { Image, FileAudio, FileVideo, FileText, Search, User } from 'lucide-vue-next'
import type { MediaType } from '../types'

const props = defineProps<{ type: MediaType | ''; search: string; scope: 'all' | 'mine' }>()
const emit = defineEmits<{
    (event: 'update:type', value: MediaType | ''): void
    (event: 'update:search', value: string): void
    (event: 'update:scope', value: 'all' | 'mine'): void
}>()

interface TypePill {
    value: MediaType | ''
    label: string
    icon: typeof Image
}

const pills: TypePill[] = [
    { value: '', label: 'All', icon: Search },
    { value: 'image', label: 'Images', icon: Image },
    { value: 'audio', label: 'Audio', icon: FileAudio },
    { value: 'video', label: 'Video', icon: FileVideo },
    { value: 'document', label: 'Documents', icon: FileText },
]

const selected = computed(() => props.type)
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
            <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                :class="
                    scope === 'mine'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                "
                data-testid="media-scope-mine"
                @click="emit('update:scope', scope === 'mine' ? 'all' : 'mine')"
            >
                <User class="h-3.5 w-3.5" />
                Uploaded by me
            </button>
        </div>
        <label class="relative block">
            <span class="sr-only">Search</span>
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                type="search"
                :value="search"
                aria-label="Search"
                placeholder="Search prompts and tags…"
                class="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="media-search"
                @input="emit('update:search', ($event.target as HTMLInputElement).value)"
            />
        </label>
    </div>
</template>