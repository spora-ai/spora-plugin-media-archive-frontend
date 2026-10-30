# spora-plugin-media-archive-frontend

Pre-built Vue SPA for the Spora **Media Archive** admin panel. Delivered as a Composer package of type `spora-plugin-frontend`; `spora-installer`'s `SporaPluginFrontendInstaller` copies this repo's `frontend/` directory into `public/plugins/media-archive/` so the host SPA can lazy-load it via `/plugins/media-archive/main.js`. The directory name comes from this package's `composer.json#extra.spora-plugin-slug` (`media-archive`), which must equal the parent plugin's `plugin.json#slug` — there is no fallback to the package name.

## Why a separate repo from the PHP plugin?

- The Vue bundle has its own release cadence (visual fixes don't need a PHP tag).
- Backend-only operators can `composer require spora-ai/spora-plugin-media-archive` without pulling in npm-buildable assets.
- The bundle is independently testable in isolation (Vitest + the smoke script).

## Detail-drawer affordances

The detail drawer (right-side panel that opens when a card is selected) covers the operational lifecycle of a media asset:

- Inline rename of the filename, tags, and prompt via accessible `<form>` edit patterns (click-to-edit, Esc/Cancel reverts).
- The asset's folder (read-only — the folder list is the operator's to curate) and its kind (editable: the mark is the operator's, per the plan's decision D2).
- Public-share toggle, copy-URL, and token rotation — all routed through the host's typed API client (`hostContext.api`) so CSRF, base URL, and envelope unwrap are handled centrally.
- Delete confirmation via a real `<dialog>` element (replaces the old `window.confirm`) with a focus-trapped Cancel/Delete pair.
- Lightbox preview for image and video assets with `aria-modal="true"`, save-and-restore focus on close, and `Escape` / click-outside dismissal.
- Safe external source link: only `http(s)` schemes render as anchors; `javascript:` and other schemes show an "Invalid source URL" hint instead.
- Live region (`role="status"` + `aria-live="polite"`) announces sharing state and toast notifications to assistive tech.
- All edit-save buttons disable while a save is in flight so the user cannot double-submit a conflicting PATCH.
- PDF derivatives surface as a download card (filename + Download PDF button linking to the asset URL with a `download` attribute). The earlier `<iframe>` preview was removed because most browsers replace it with a built-in PDF viewer that triggers a download on stray clicks.
- Text-type selections — a `text/*` source, or a derivative whose own `mime_type` is `text/*` — fetch their bytes on demand from the selected row's `asset_url` with `credentials: 'include'`, and the fetch is gated on the operator landing on that chip so derivative-first workflows don't pay the cost. The `md` derivative (a document's extracted text, produced by spora-core's `PdfToMarkdownProducer` / the word plugin's `DocxToMarkdownProducer`) and any other markdown-ish MIME render through `md-editor-v3`'s `<MdPreview>`; every other text type keeps a verbatim `<pre>`. Resolution reads the **MIME**, not the format slug — `md` is not self-describing.
- Image thumbnails on the grid use `object-contain` (was `object-cover`) so portrait derivatives (e.g. Typst A4 renders) fit within the square card without cropping; the letterbox background is the card's own background.

## Grid pagination

- The grid renders 24 rows per page; if the response carries `lastPage > 1` a 'Load more' button appears under the cards with a 'Showing N of total' counter.
- Clicking appends the next page; rows are deduplicated by id against the existing rows so a concurrent insert landing the same row on consecutive pages doesn't render it twice.
- Filter changes (type pill, kind chip, folder, search, scope chip) reset to page 1 — the Load-more button disappears when `lastPage` drops back to 1.

## Scope chip row

The grid mounts a dashboard-style `ALL / My Media / Group A / …` chip row above the search input:

- Pulls `/principals/me` + `/groups` on mount to populate the chip labels; both calls are best-effort so a transient failure leaves the empty-label fallback (`Group #N`) without blocking the grid.
- Translates the single-pick chip state into repeated `?principal_id=` keys on the listing request — `ALL` sends every visible principal, `My Media` sends just the user-principal, a group chip sends just that group's principal. The controller intersects with `visiblePrincipalIds()`, so an out-of-scope id never reaches the service.
- Click-the-active-chip-to-clear: matches the dashboard's flag-chip toggle behaviour.

## Folder tree

The filter bar carries a tree of the media library's folders, built on the client from the flat `parent_id` list the server returns:

- `GET /media/folders?principal_id=…` answers per principal, so the panel asks once per visible principal and keeps the answers apart. The tree shows the folders of the principals **in scope**: a folder of a principal outside the scope would filter the listing down to nothing, so it is not offered.
- The tree's root is the whole library; picking a folder sends the scalar `?folder_id=<uuid>`. The array-bracket form is deliberately not used — a multi-folder filter would need a `WHERE folder_id IN (…)`, and a half-implemented one that silently returns a single folder's rows is worse than none.
- Each folder shows the number of assets filed *directly* in it, and the root carries no count (the endpoint does not report one).
- Changing the scope drops a folder selection the new scope cannot filter by.

## Kind filter

An `asset / template / example` chip row next to the type pills, plus an unfiltered state:

- The mark is advisory — nothing in the read or the write path refuses an asset because of it — and the operator owns it, so the detail page offers it as a select that PATCHes `{"kind": …}`.
- The listing request carries one `?kind=` value; the server drops an unknown one and leaves the listing unfiltered.

## Upload

- The upload dialog attributes the file to one of the operator's visible principals, and can file it into one of **that** principal's folders. The picker offers only the selected principal's folders — the server files the upload into the principal the form names and refuses a folder of another one, so offering them would be offering a 422.
- Changing the principal drops the picked folder.

## Build

```bash
npm install
npm run build   # writes frontend/main.js + frontend/style.css
npm run smoke   # asserts window.SporaAppMediaArchive.mount is a function
```

The build output (`main.js` + `style.css`) is committed to this repo. Operators get the new bundle on the next `composer update`.

## Dev mode (plugin author)

```bash
npm run dev   # vite dev server on :5174
```

The host SPA proxies `/plugins/media-archive` to `:5174` so editing `src/*` updates the panel without rebuilding the host. The proxy is not hard-coded: start the host with `SPORA_PLUGIN_DEV_PORTS=media-archive:5174 npm run dev` and it installs one per listed slug. See `https://docs.spora-ai.com/develop/plugins/local-development.html` for the dev workflow.

The dev sandbox reads `?locale=de` from the query string, so the panel can be rendered in German without a backend.

## Translations

The panel ships its own catalogue under `src/locales/`. `en.json` is generated from the source — the key *is* the English string — and `de.json` is hand-edited.

```bash
npm run i18n:extract   # regenerate src/locales/en.json
npm run i18n:check     # the CI gate: catalogue drift, missing keys, untranslated copy
```

`npm run i18n:check` also fails on operator-facing copy that is not wrapped in `t()`, so a new string cannot ship untranslated by accident.

### Catalogue grammar

This panel's rule 0 asks vue-i18n's own message compiler whether a key compiles, so the catalogue may use the interpolation syntax it was always meant to: `{name}` and the `|` plural separator. Fifteen keys in `de.json` do.

The **host's** extractor is stricter — it rejects any key carrying a raw `{`, `}` or `|`, and the host's own catalogue therefore holds no unescaped placeholder. The two grammars never meet: this panel's catalogue is read by this panel's extractor, the host's by the host's, and the host's `i18n:check` harvests the framework's own sources and never opens a plugin's catalogue.

That makes the difference a contract divergence rather than a break, and vue-i18n compiles at render either way. It is also stable under the merge: a key *is* the English source text, so a string present in both catalogues carries the same placeholders in both. Do not rewrite this panel's keys to satisfy the host's rule, and do not loosen the host's rule to match this one.

## Mount contract

The IIFE bundle installs `window.SporaAppMediaArchive` (the PascalCase of the slug) with two methods:

- `mount(target: HTMLElement, hostContext)` — create the app, install local Pinia and the plugin's own i18n instance, mount into the host's slot.
- `unmount(target: HTMLElement)` — tear down.

The host's `apps/registry.ts` reads both. The bundle names **must** stay aligned with `media-archive` → `SporaAppMediaArchive` (see `vite.config.ts → build.lib.name`).

## License

MIT — see [LICENSE](LICENSE).