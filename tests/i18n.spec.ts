import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import App from '../src/App.vue'
import MediaFilters from '../src/components/MediaFilters.vue'
import en from '../src/locales/en.json'
import de from '../src/locales/de.json'
import { messages } from '../src/i18n'

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
                    api: {
                        get: async () => ({ assets: [], page: 1, perPage: 24, total: 0, lastPage: 1 }),
                        post: async () => ({}),
                        postForm: async () => ({}),
                        patch: async () => ({}),
                        delete: async () => ({}),
                    },
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

    it('renders the type pills in German', () => {
        const wrapper = mount(MediaFilters, {
            props: {
                type: '',
                search: '',
                principals: [],
                selectedScope: null,
                groupLabels: {},
            },
            global: {
                plugins: [createI18n({ legacy: false, locale: 'de', fallbackLocale: 'en', messages })],
            },
        })

        expect(wrapper.find('[data-testid="media-type-all"]').text()).toContain('Alle')
        expect(wrapper.find('[data-testid="media-type-image"]').text()).toContain('Bilder')
        expect(wrapper.find('[data-testid="media-type-document"]').text()).toContain('Dokumente')
    })
})
