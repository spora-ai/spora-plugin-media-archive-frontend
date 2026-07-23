#!/usr/bin/env node
/**
 * Static-analysis smoke check for the production plugin assets.
 *
 * Vue's top-level createApp()/defineComponent() calls need a real renderer,
 * so we inspect the IIFE wrapper instead of evaluating it. The stylesheet
 * checks lock in the plugin boundary: Tailwind utilities must remain scoped
 * and the host-owned preflight reset must not be emitted.
 */
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = resolve(here, '..', 'frontend', 'main.js')
const stylesheetPath = resolve(here, '..', 'frontend', 'style.css')

let txt
let css
try {
    ;[txt, css] = await Promise.all([
        readFile(bundlePath, 'utf8'),
        readFile(stylesheetPath, 'utf8'),
    ])
} catch (e) {
    console.error(`smoke: cannot read build output: ${e.message}`)
    process.exit(1)
}

const globalName = 'SporaAppMediaArchive'
const failures = []

if (!txt.includes(`window.${globalName}=`)) {
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

const scopeSelector = '#spora-plugin-media-archive'
if (!css.includes(scopeSelector)) {
    failures.push(`stylesheet does not scope utilities beneath ${scopeSelector}`)
}

const unscopedDisplayUtilityRe = /(?:^|})\s*\.(?:hidden|flex|inline-flex)\s*\{\s*display\s*:/
if (unscopedDisplayUtilityRe.test(css)) {
    failures.push('stylesheet contains an unscoped Tailwind display utility')
}

const preflightRe = /box-sizing\s*:\s*border-box;\s*border-width\s*:\s*0;\s*border-style\s*:\s*solid/
if (preflightRe.test(css)) {
    failures.push('stylesheet contains the Tailwind preflight reset')
}

if (failures.length > 0) {
    console.error('smoke: FAIL')
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
}

console.log('smoke: OK')
