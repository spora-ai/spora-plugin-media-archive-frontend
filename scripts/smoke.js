#!/usr/bin/env node
/**
 * Static-analysis smoke check for the production IIFE bundle.
 *
 * Vue's top-level createApp()/defineComponent() calls need a real
 * renderer, so we cannot evaluate the bundle in `node:vm` — instead
 * we assert the wrapper shape the host's `apps/registry.ts` relies on:
 * `window.<libName>=`, `mount(a, b)`, and `unmount(a)`. The variable
 * names inside the wrapper are minifier-dependent and excluded.
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

const windowAssignRe = new RegExp(`window\\.${globalName}=`)
if (!windowAssignRe.test(txt)) {
    failures.push(`bundle does not assign window.${globalName}=`)
}

const mountRe = /\bmount\s*\(\s*[a-zA-Z_$][\w$]*\s*,\s*[a-zA-Z_$][\w$]*\s*\)/
if (!mountRe.test(txt)) {
    failures.push('bundle does not define `mount(a, b)` with two parameters')
}

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
