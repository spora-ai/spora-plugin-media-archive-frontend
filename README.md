# spora-plugin-media-archive-frontend

Pre-built Vue SPA for the Spora **Media Archive** admin panel. Delivered as a Composer package of type `spora-plugin-frontend`; `spora-installer`'s `SporaPluginFrontendInstaller` copies this repo's `frontend/` directory into `public/plugins/spora-plugin-media-archive-frontend/` so the host SPA can lazy-load it via `/plugins/spora-plugin-media-archive-frontend/main.js`.

## Why a separate repo from the PHP plugin?

- The Vue bundle has its own release cadence (visual fixes don't need a PHP tag).
- Backend-only operators can `composer require spora-ai/spora-plugin-media-archive` without pulling in npm-buildable assets.
- The bundle is independently testable in isolation (Vitest + the smoke script).

## Detail-drawer affordances

The detail drawer (right-side panel that opens when a card is selected) covers the operational lifecycle of a media asset:

- Inline rename of the filename, tags, and prompt via accessible `<form>` edit patterns (click-to-edit, Esc/Cancel reverts).
- Public-share toggle, copy-URL, and token rotation — all routed through the host's typed API client (`hostContext.api`) so CSRF, base URL, and envelope unwrap are handled centrally.
- Delete confirmation via a real `<dialog>` element (replaces the old `window.confirm`) with a focus-trapped Cancel/Delete pair.
- Lightbox preview for image and video assets with `aria-modal="true"`, save-and-restore focus on close, and `Escape` / click-outside dismissal.
- Safe external source link: only `http(s)` schemes render as anchors; `javascript:` and other schemes show an "Invalid source URL" hint instead.
- Live region (`role="status"` + `aria-live="polite"`) announces sharing state and toast notifications to assistive tech.
- All edit-save buttons disable while a save is in flight so the user cannot double-submit a conflicting PATCH.

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

The host SPA's `vite.config.ts` proxies `/plugins/spora-plugin-media-archive-frontend` to `:5174` so editing `src/*` updates the panel without rebuilding the host. See `docs.spora-ai.com/develop/plugins/authoring-frontend` for the dev workflow.

## Mount contract

The IIFE bundle installs `window.SporaAppMediaArchive` (the PascalCase of the slug) with two methods:

- `mount(target: HTMLElement, hostContext)` — create the app, install local Pinia, mount into the host's slot.
- `unmount(target: HTMLElement)` — tear down.

The host's `apps/registry.ts` reads both. The bundle names **must** stay aligned with `media-archive` → `SporaAppMediaArchive` (see `vite.config.ts → build.lib.name`).

## License

MIT — see [LICENSE](LICENSE).