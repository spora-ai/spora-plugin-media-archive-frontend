import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * Open/close behaviour for a dropdown menu.
 *
 * The Custom Skills panel's scope control has no click-outside and no
 * Escape handling; the host's `KebabMenu.vue` has both. This is the host's
 * behaviour, extracted so three dropdowns can share it.
 *
 * The menu itself is rendered with `v-if`, so an open menu is in the DOM
 * — and is focusable — only while it is open. The `data-media-menu`
 * attribute is what lets a caller tell whether one is open: the rail's
 * drawer closes on Escape, but a drawer with an open menu in it should
 * lose the menu first and the drawer second.
 */
export interface DropdownMenu {
    open: Ref<boolean>
    root: Ref<HTMLElement | null>
    toggle: () => void
    close: () => void
}

export function useDropdownMenu(): DropdownMenu {
    const open = ref(false)
    const root = ref<HTMLElement | null>(null)

    function toggle(): void {
        open.value = !open.value
    }

    function close(): void {
        open.value = false
    }

    function onDocumentClick(event: MouseEvent): void {
        if (!open.value) return
        const target = event.target as Node | null
        if (root.value !== null && target !== null && !root.value.contains(target)) {
            close()
        }
    }

    function onDocumentKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape' && open.value) {
            close()
        }
    }

    onMounted(() => {
        document.addEventListener('click', onDocumentClick)
        document.addEventListener('keydown', onDocumentKeydown)
    })

    onBeforeUnmount(() => {
        document.removeEventListener('click', onDocumentClick)
        document.removeEventListener('keydown', onDocumentKeydown)
    })

    return { open, root, toggle, close }
}
