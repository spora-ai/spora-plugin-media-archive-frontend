#!/usr/bin/env node
/**
 * Smoke test for the production IIFE bundle.
 *
 * Asserts the runtime contract the host SPA's
 * `apps/registry.ts → mountPlugin()` depends on:
 *
 *   1. The bundle assigns `window.SporaApp<Name>` (derived from
 *      `build.lib.name`).
 *   2. The exported object has a callable `mount(target, hostContext)`.
 *   3. The exported object has a callable `unmount(target)`.
 *
 * Implementation notes:
 *
 *   - We match the IIFE wrapper's inner function signatures
 *     (`mount(t,o)` and `unmount(t)`) because Rollup preserves
 *     *external* identifier names — only internal locals get mangled.
 *     The variable that holds the export (historically named `w`,
 *     sometimes `B` depending on the surrounding scope) is minified
 *     and intentionally NOT part of the assertion.
 *   - We do NOT try to evaluate the bundle. Vue's top-level
 *     `createApp(...)` and `defineComponent(...)` calls require a
 *     real renderer / reactive system that isn't available in
 *     `node:vm` without a heavy DOM mock. Static-analysis matches
 *     on the wrapper structure are sufficient to catch the
 *     "wrong global name" / "missing exports" regressions the
 *     smoke check was originally written for.
 */
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = resolve(here, '..', 'frontend', 'main.js')

let txt
try {
    txt = await readFile(bundlePath, 'utf8')
} catch (e) {
    console.error(`smoke: cannot read ${bundlePath}: ${e.message}`)
    process.exit(1)
}

const globalName = 'SporaAppMediaArchive'
const failures = []

// 1. The bundle must publish the IIFE export on `window.<globalName>`.
//    The wrapper emits `return window.<globalName>=X,X` (the inner X
//    is the export object — the comma operator forces the assignment
//    to evaluate first). Match the prefix; the variable name is
//    minifier-dependent and intentionally absent from the regex.
const windowAssignRe = new RegExp(`window\\.${globalName}=`)
if (!windowAssignRe.test(txt)) {
    failures.push(`bundle does not assign window.${globalName}=`)
}

// 2. `mount(target, hostContext)` — Rollup preserves the function name
//    because the registry calls it as `global.mount(target, ctx)`.
//    The two-arg arity matters: a regression that drops the second
//    parameter would still typecheck but break hostContext propagation.
const mountRe = /\bmount\s*\(\s*[a-zA-Z_$][\w$]*\s*,\s*[a-zA-Z_$][\w$]*\s*\)/
if (!mountRe.test(txt)) {
    failures.push('bundle does not define `mount(a, b)` with two parameters')
}

// 3. `unmount(target)` — single-arg, same rationale.
const unmountRe = /\bunmount\s*\(\s*[a-zA-Z_$][\w$]*\s*\)/
if (!unmountRe.test(txt)) {
    failures.push('bundle does not define `unmount(a)` with one parameter')
}

if (failures.length > 0) {
    console.error('smoke: FAIL')
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
}

console.log('smoke: OK')
