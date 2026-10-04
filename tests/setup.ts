/**
 * Vitest global setup — mocks for browser APIs not available in happy-dom
 * and heavy third-party components that touch the DOM in ways the test
 * runner can't easily support.
 *
 * - `md-editor-v3` mounts CodeMirror 6 + highlight.js + katex + mermaid.
 *   Happy-dom doesn't provide the layout primitives those need and the
 *   library would try to fetch external CSS from unpkg.com. We replace
 *   `<MdPreview>` — the only export the detail page still uses, to render
 *   an `md` derivative in the preview pane — with a lightweight stub that
 *   exposes the source markdown, so consumers can still assert on what
 *   the preview was handed without a real renderer.
 *
 *   The stub survives the removal of the operator markdown `<MdEditor>`:
 *   the module is a dependency, not a per-component choice.
 */
/* eslint-disable vue/require-prop-types --
   This is a Vitest stub for an external library; it intentionally
   declares props as a string array to mirror the production surface
   without pulling in the real `md-editor-v3` types (which would drag
   in CodeMirror 6 type defs the test runner can't satisfy). */

import { vi } from 'vitest'

vi.mock('md-editor-v3', async () => {
    const { defineComponent, h } = await import('vue')

    const MdPreview = defineComponent({
        name: 'MdPreview',
        // Mirror the props the production template binds so vue-tsc
        // doesn't reject them at runtime. The stub ignores the value of
        // everything except `modelValue` and renders it verbatim — the
        // assertion a test can make is "the markdown reached the
        // renderer", not "the renderer parsed it".
        props: ['modelValue', 'theme', 'language'],
        setup(props) {
            return () => h('div', {
                'data-testid': 'md-preview-stub',
                'data-md-preview': 'true',
            }, (props.modelValue as string | null | undefined) ?? '')
        },
    })

    return { MdPreview }
})
