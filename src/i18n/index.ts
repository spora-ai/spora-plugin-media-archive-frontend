/**
 * i18n instance — Composition API only (`legacy: false`).
 *
 * The plugin builds its own instance from its own catalogue rather than
 * sharing the host's: the host does not publish its instance, so a plugin
 * cannot depend on the host's catalogue lifetime or on a version-skewed
 * peer range.
 *
 * The catalogues are bundled rather than fetched: `import.meta.glob` with
 * `eager: true` inlines every `src/locales/*.json` at build time, so a
 * locale switch never waits on the network.
 *
 * `en.json` is a generated identity map (`"Save": "Save"`), so the fallback
 * chain costs nothing and an unmigrated key renders as the English source
 * rather than as a raw key.
 *
 * **There is no module-scope `t()` here, and that is deliberate.** The other
 * four plugin frontends export one because they have stores or plain modules
 * that translate; this panel has neither — every operator-facing string is
 * rendered inside a component, and a component reaches the catalogue through
 * `useI18n()`. An exported helper nobody calls is an API the next reader has
 * to maintain for nothing.
 *
 * The gate covers the gap: `npm run i18n:check` fails on operator-facing
 * copy outside `t()` in a `.ts` module too, so the first plain module that
 * needs to translate breaks the build instead of shipping English. Add the
 * helper then, recording the composer in `createPluginI18n` the way the four
 * sibling frontends do.
 */
import { createI18n } from 'vue-i18n'

export const FALLBACK_LOCALE = 'en'

const catalogues = import.meta.glob<Record<string, string>>('../locales/*.json', {
    eager: true,
    import: 'default',
})

export const messages = Object.fromEntries(
    Object.entries(catalogues).map(([path, catalogue]) => [
        path.slice(path.lastIndexOf('/') + 1, -'.json'.length),
        catalogue,
    ]),
)

/**
 * Build the instance for a locale.
 *
 * The key is the English source string, so the catalogue is flat and a
 * copy edit orphans the old entry — `scripts/i18n.mjs` catches that as a
 * dead translation.
 */
export function createPluginI18n(locale: string) {
    return createI18n({
        legacy: false,
        locale,
        fallbackLocale: FALLBACK_LOCALE,
        messages,
    })
}
