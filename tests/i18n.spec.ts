import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import App from '../src/App.vue'
import MediaToolbar from '../src/components/MediaToolbar.vue'
import MediaFolderRail from '../src/components/MediaFolderRail.vue'
import en from '../src/locales/en.json'
import de from '../src/locales/de.json'
import { messages } from '../src/i18n'
import type { PluginHostContext } from '../src/shims'

/**
 * The catalogue's own invariants, and the wiring that makes a German
 * operator see German.
 *
 * The extractor's CI gate already fails on a missing or orphaned key; what
 * it cannot see is a *placeholder* that was dropped from a translation. A
 * German value missing `{error}` renders the sentence without the error,
 * which looks like a bug in the API rather than in the catalogue.
 */

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

function placeholders(message: string): string[] {
    return [...message.matchAll(PLACEHOLDER)].map((match) => match[1])
}

describe('German catalogue', () => {
    it('has the same keys as the English identity map', () => {
        expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort())
    })

    it('keeps every placeholder the English key carries', () => {
        for (const [key, value] of Object.entries(de)) {
            expect(
                placeholders(value).sort(),
                `placeholder mismatch for ${JSON.stringify(key)}`,
            ).toEqual(placeholders(key).sort())
        }
    })

    it('translates every key rather than echoing it', () => {
        for (const [key, value] of Object.entries(de)) {
            expect(value, `untranslated: ${JSON.stringify(key)}`).not.toBe(key)
        }
    })
})

describe('German rendering', () => {
    it('renders the panel in German when the host locale is German', () => {
        const wrapper = mount(App, {
            props: {
                hostContext: {
                    // The host's API is generic in its response type, so a
                    // mock of it has to be cast: a concrete return type is
                    // not assignable to `Promise<T>`.
                    api: {
                        get: async () => ({ assets: [], page: 1, perPage: 24, total: 0, lastPage: 1 }),
                        post: async () => ({}),
                        postForm: async () => ({}),
                        patch: async () => ({}),
                        delete: async () => ({}),
                    } as unknown as PluginHostContext['api'],
                    pinia: null,
                    theme: 'light',
                    locale: 'de',
                    route: null,
                    router: null,
                },
            },
            global: {
                plugins: [createI18n({ legacy: false, locale: 'de', fallbackLocale: 'en', messages })],
            },
        })

        expect(wrapper.text()).toContain('Hochladen')
        expect(wrapper.text()).toContain('0 Dateien in Ihrem Archiv.')
    })

    it('renders the type dropdown in German', async () => {
        const wrapper = mount(MediaToolbar, {
            props: {
                type: '',
                search: '',
                kind: '',
                principals: [],
                selectedScope: null,
                groupLabels: {},
            },
            global: {
                plugins: [createI18n({ legacy: false, locale: 'de', fallbackLocale: 'en', messages })],
            },
        })

        await wrapper.find('[data-testid="media-type-select-toggle"]').trigger('click')
        expect(wrapper.find('[data-testid="media-type-select-option-all"]').text()).toContain('Alle')
        expect(wrapper.find('[data-testid="media-type-select-option-image"]').text()).toContain('Bilder')
        expect(wrapper.find('[data-testid="media-type-select-option-document"]').text()).toContain('Dokumente')
    })

    it('renders the folder rail in German', () => {
        const wrapper = mount(MediaFolderRail, {
            props: {
                principals: [{ id: 101, type: 'user', user_id: 1, group_id: null }],
                selectedScope: null,
                groupLabels: {},
            },
            global: {
                plugins: [createI18n({ legacy: false, locale: 'de', fallbackLocale: 'en', messages })],
            },
        })

        expect(wrapper.text()).toContain('Ordner')
        expect(wrapper.find('[data-testid="media-new-folder-button"]').text()).toContain('Neuer Ordner')
        expect(wrapper.find('[data-testid="media-folder-root"]').text()).toContain('Alle Medien')
    })
})
