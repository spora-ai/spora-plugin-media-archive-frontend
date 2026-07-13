# Releasing spora-plugin-media-archive-frontend

This package is published on Packagist as `spora-ai/spora-plugin-media-archive-frontend`. Releases use GitHub Releases for the asset tarball; Packagist indexes from the git tag, so the `dist.url` in the **tagged** `composer.json` must point at the correct asset.

## Release process

1. **Open a release prep PR** against `main`:
   - Bump `package.json` `version` to the next semver (e.g. `0.1.1`)
   - Update `composer.json` `dist.url` to the matching URL:
     ```
     https://github.com/spora-ai/spora-plugin-media-archive-frontend/releases/download/v<VERSION>/spora-plugin-media-archive-frontend-v<VERSION>.tar.gz
     ```
   - Update `CHANGELOG.md` (if present) and `README.md` if needed
2. **Merge the PR** to `main`.
3. **Tag the merge commit** from `main`:
   ```bash
   git checkout main && git pull --ff-only
   git tag v<VERSION>    # e.g. v0.1.1
   git push origin v<VERSION>
   ```
4. The `build-and-release` workflow fires:
   - Builds the bundle (`vue-tsc && vite build`)
   - Verifies the tagged `composer.json`'s `dist.url` matches the tag (fails loudly if not)
   - Verifies the artifact contains only `frontend/` contents (no source code, configs, or `node_modules`)
   - Creates the GitHub Release with the asset attached
5. Packagist auto-indexes the new tag within ~5 minutes.

## Release artifact shape

The GitHub Release asset (`spora-plugin-media-archive-frontend-v<VERSION>.tar.gz`) contains **the `frontend/` directory verbatim** (the Vite IIFE bundle output — `main.js` and optionally `style.css`), under a single versioned root directory that matches the tag:

```
spora-plugin-media-archive-frontend-v<VERSION>.tar.gz
└── spora-plugin-media-archive-frontend-v<VERSION>/     # versioned root — required by PHP's PharData
    └── frontend/                                        # preserved as a subdir so the installer can find it
        ├── main.js                                      # the IIFE bundle (window.SporaAppMediaArchive = ...)
        └── style.css                                    # Tailwind-compiled CSS (optional — only present when <style> blocks exist)
```

**Nothing else ships in the archive** — no source files, no `package.json`, no `node_modules`, no build configs. The release tarball is built explicitly from `frontend/` in the `build-and-release` workflow, and the `Verify only frontend/ is shipped` step in the same workflow fails the build if any non-`frontend/` path slips into the archive (deny-list + allow-list assertions).

The installer in `spora-ai/installer` (any 1.x release) unpacks this tarball into `public/plugins/media-archive-frontend/` on the operator's host, so the host SPA's dynamic `import('/plugins/media-archive-frontend/main.js')` (per `registry.ts → mountPlugin`) finds the IIFE bundle at the path it expects. `style.css` is optional: when components don't ship `<style>` blocks, Vite doesn't emit it, the installer copies whatever's in `frontend/`, and the host's `PluginAppPage` auto-injects a `<link>` that 404s silently if the file is absent.

The versioned root is **load-bearing** — see "Why a versioned root directory" below.

Note: `composer.json`'s `archive.exclude` block is **only consumed by `composer archive`** — it has no effect on the GitHub Release tarball, which is built by the CI workflow directly from `frontend/`. It's there as defense-in-depth so a maintainer running `composer archive` locally doesn't accidentally ship source files in a one-off manual release.

## Why a versioned root directory

Composer's `TarDownloader` uses PHP's `PharData::extractTo()` internally, which fails with `Cannot extract '.', internal error` on the leading `.` directory entry. PHP requires the archive to have a non-trivial root directory.

The fix is to wrap the contents in a versioned root before tarring:

```bash
mkdir -p staging/spora-plugin-media-archive-frontend-${TAG}
cp -R frontend/. staging/spora-plugin-media-archive-frontend-${TAG}/
tar -czf spora-plugin-media-archive-frontend-${TAG}.tar.gz -C staging spora-plugin-media-archive-frontend-${TAG}
```

This produces `spora-plugin-media-archive-frontend-v<X.Y.Z>/…` entries.

## Why this is the process

`composer install` reads `dist.url` from the **tagged** `composer.json`, not from the CI workspace. If you skip the prep PR and just tag the old `composer.json`, `composer install` will resolve the URL to a 404 because the new release asset doesn't exist at the old URL.

## Rollback

If a release is broken, do NOT delete + retag the same version. Git tags are immutable. Instead, tag a new patch version (e.g. `v0.1.0` → `v0.1.1`) with the fix.

## First release checklist (v0.1.3)

The v0.1.3 release ships the corrected release artifact shape — `frontend/` is preserved as a subdir in the tarball, so `SporaPluginFrontendInstaller::copyFrontend()` (in `spora-installer`) can find it after `LibraryInstaller` extracts. Confirm:

- [ ] `package.json` `version` is `0.1.3`
- [ ] `composer.json` `dist.url` is `https://github.com/spora-ai/spora-plugin-media-archive-frontend/releases/download/v0.1.3/spora-plugin-media-archive-frontend-v0.1.3.tar.gz`
- [ ] `composer.json` `archive.exclude` no longer contains `/frontend` (otherwise `composer archive` strips it — see the "Release artifact shape" section above about defense-in-depth)
- [ ] `ci.yml` `Verify only frontend/ is shipped` step updated to expect `frontend/main.js` under the versioned root
- [ ] SonarCloud gate green on the `main` HEAD (the merged commits)
- [ ] Lint + Test + Build jobs green on the `main` HEAD