import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * Vite config for the Media Archive IIFE bundle.
 *
 * Three things matter here:
 *
 *  1. `build.lib.formats: ['iife']` produces a single self-contained script
 *     that the host SPA can dynamic `import()`. ES modules / UMD would break
 *     the IIFE semantics the host registry expects.
 *  2. `build.lib.name: 'SporaAppMediaArchive'` matches
 *     `registry.ts → globalFor()` in `spora-frontend`. The IIFE wrapper
 *     exposes the named export on `window.<name>`. PascalCase of the slug
 *     (`media-archive`) is the convention — do not use kebab-case here.
 *  3. `build.rollupOptions.external: ['vue', 'pinia']` keeps Vue and Pinia
 *     out of the bundle so the host SPA's instances are shared. Sharing
 *     Pinia is what lets the plugin read auth/theme state; sharing Vue is
 *     what prevents the slot from re-creating a second app instance.
 *
 * `build.outDir: '.'` writes `main.js` + `style.css` directly into this
 * `frontend/` directory (one level up from `src/`) — that's the directory
 * `SporaPluginFrontendInstaller` copies into `public/plugins/<slug>/`.
 *
 * The `test` block is a Vitest extension to Vite's config. Vitest reads it
 * when running `npm test`; Vite ignores it on `npm run build`. We pass it
 * through via spread so both consumers see the same shape.
 */
export default defineConfig({
    plugins: [vue()],
    // `base` is the public URL prefix Vite uses for absolute paths in the
    // dev-server-served HTML and for the HMR client. In standalone dev
    // (`npm run dev`) it controls where the sandbox is served; in the
    // host-proxied dev flow it MUST match the host's proxy prefix
    // (`SPORA_PLUGIN_DEV_PORTS=media-archive:5174` on the host → the
    // host's Vite forwards `/plugins/<slug>/*` to this server).
    //
    // Without this, the transformed module imports reference absolute
    // paths like `/src/App.vue` and `/node_modules/.vite/deps/vue.js`,
    // which the browser resolves against the document's origin (the
    // host's :5173, not this server's :5174). The host doesn't have
    // `/src/App.vue` and the sub-requests 404 silently — `window.SporaAppMediaArchive`
    // is never assigned because the module's top-level code never finishes
    // executing.
    //
    // The slug here mirrors the PHP app's `MediaArchiveApp::name()` —
    // they're a coupled pair, not derivable from package metadata. The
    // build output is unaffected: the IIFE lib emits a single self-
    // contained `main.js` that doesn't reference its own base.
    base: '/plugins/media-archive/',
    build: {
        // Write the IIFE bundle into `frontend/`. `SporaPluginFrontendInstaller`
        // (in spora-installer) copies the package's `frontend/` directory
        // verbatim into `public/plugins/<slug>/` at install time, so the
        // build output MUST live there. The `npm run clean` script removes
        // `frontend/main.js` if you need to rebuild from scratch.
        outDir: 'frontend',
        emptyOutDir: false,
        lib: {
            entry: 'src/main.ts',
            formats: ['iife'],
            name: 'SporaAppMediaArchive',
            fileName: () => 'main.js',
        },
        rollupOptions: {
            external: ['vue', 'pinia'],
            output: {
                // Avoid the IIFE wrapper injecting inline `var` declarations
                // that would shadow window properties the host relies on.
                extend: true,
                // Map externalised deps to their host-provided globals. With
                // the default iife wrapper, Rollup emits the call site as
                // `})(Vue, Pinia);` — passing bare identifiers that resolve
                // to ReferenceErrors when the bundle is loaded as a module
                // (the host's `apps/registry.ts` does
                // `import('/plugins/<slug>/main.js')`, which evaluates the
                // script in module scope where `Vue` and `Pinia` aren't free
                // variables). Substituting the call-site expressions with
                // `window.Vue` / `window.Pinia` looks up the host's already-
                // published globals at evaluation time. The host SPA exposes
                // `window.Vue` / `window.Pinia` for exactly this reason.
                globals: {
                    vue: 'window.Vue',
                    pinia: 'window.Pinia',
                },
                assetFileNames: (asset) => {
                    if (asset.name && asset.name.endsWith('.css')) {
                        return 'style.css'
                    }
                    return asset.name ?? '[name][extname]'
                },
            },
        },
    },
    server: {
        port: 5174,
        strictPort: false,
        cors: true,
    },
    test: {
        environment: 'happy-dom',
        globals: true,
        // Emit `coverage/lcov.info` so SonarCloud can read it. The v8
        // provider only writes coverage-final.json + clover.xml by default;
        // we explicitly add `lcov` here to satisfy the SonarSource action's
        // `sonar.javascript.lcov.reportPaths=coverage/lcov.info` setting.
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'clover', 'json'],
            reportsDirectory: './coverage',
            include: ['src/**/*.{ts,vue}'],
            // dev-main.ts is the side-effecting Vue bootstrap that mounts
            // the app into the dev sandbox's #app node. It imports the
            // document/window globals and is only loaded by index.html
            // in `npm run dev` mode — production ships main.ts instead.
            // Excluding it from coverage measurement keeps SonarCloud's
            // "new code must have ≥80% coverage" gate honest: dev tooling
            // isn't production code. The pure helpers it composes live
            // in dev-mock.ts which IS fully tested.
            exclude: ['src/dev-main.ts'],
        },
    },
})