/**
 * Vitest global setup — mocks for browser APIs not available in happy-dom
 * and heavy third-party components that touch the DOM in ways the test
 * runner can't easily support.
 *
 * `md-editor-v3` mounts CodeMirror 6 + highlight.js + katex + mermaid and
 * fetches CSS from unpkg.com, so `<MdPreview>` — the only export the detail
 * page still uses (`<MdEditor>` is dead) — is stubbed to expose its source.
 */
/* eslint-disable vue/require-prop-types -- external-library stub; array props mirror the real API without its CodeMirror 6 types. */

import { vi } from 'vitest'

vi.mock('md-editor-v3', async () => {
    const { defineComponent, h } = await import('vue')

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

    return { MdPreview }
})
