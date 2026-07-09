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
                // Map externalised deps to their host-provided globals so the
                // IIFE wrapper emits `var vue = window.Vue` instead of an
                // unresolved reference. Vue 3 exposes its build via `window.Vue`,
                // Pinia via `window.Pinia` — both are the UMD globals the host
                // SPA already publishes.
                globals: {
                    vue: 'Vue',
                    pinia: 'Pinia',
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