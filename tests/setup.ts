/**
 * Vitest global setup — mocks for browser APIs not available in happy-dom
 * and heavy third-party components that touch the DOM in ways the test
 * runner can't easily support.
 *
 * - `md-editor-v3` mounts CodeMirror 6 + highlight.js + katex + mermaid.
 *   Happy-dom doesn't provide the layout primitives those need and the
 *   library would try to fetch external CSS from unpkg.com. We replace
 *   `<MdEditor>` and `<MdPreview>` with lightweight stubs that support
 *   `v-model` and emit `update:modelValue` so consumers can still
 *   exercise their handlers without a real editor instance.
 */
import { vi } from 'vitest'

vi.mock('md-editor-v3', async () => {
    const { defineComponent, h } = await import('vue')

    const MdEditor = defineComponent({
        name: 'MdEditor',
        // Mirror the props the production template actually binds so vue-tsc
        // doesn't reject them at runtime. The stub ignores everything except
        // modelValue/rows/disabled/placeholder, but listing the rest here
        // matches the surface our `<MdEditor>` uses (see MediaDetailPage.vue
        // :language and :toolbars bindings).
        props: [
            'modelValue',
            'theme',
            'preview',
            'placeholder',
            'rows',
            'maxLength',
            'disabled',
            'language',
            'toolbars',
        ],
        emits: ['update:modelValue'],
        setup(props, { emit }) {
            return () => {
                const value = (props.modelValue as string | null | undefined) ?? ''
                return h('textarea', {
                    'data-testid': 'md-editor-stub',
                    'data-md-editor': 'true',
                    value,
                    disabled: Boolean(props.disabled),
                    placeholder: (props.placeholder as string | undefined) ?? '',
                    rows: Number(props.rows ?? 6),
                    onInput: (e: Event) => {
                        emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
                    },
                })
            }
        },
    })

    const MdPreview = defineComponent({
        name: 'MdPreview',
        props: ['modelValue', 'theme', 'language'],
        setup(props) {
            return () => h('div', {
                'data-testid': 'md-preview-stub',
                'data-md-preview': 'true',
            }, (props.modelValue as string | null | undefined) ?? '')
        },
    })

    return { MdEditor, MdPreview }
})
