#!/usr/bin/env node
// validate-plugin-load.mjs — prove the harness-plugin rows load through the REAL
// Cordis loader path WITHOUT restarting the harness.
//
// For each row of the profile's cordis.patch.yml it reproduces boot-time loading:
//   resolve the relative name against the profile baseUrl -> import() ->
//   unwrapExports -> apply(ctx) against a real @deepseek-ai/cordis Context with a
//   `tools` service stub that records registrations.
// It validates URL resolution, ESM module shape, the inject contract, defineTool
// schema compilation, and that every expected tool registers.
//
// Usage:
//   node scripts/validate-plugin-load.mjs [patchPath] [baseUrlFileUrl]
// Defaults target the web profile under %DSH_HOME%. Package resolution is
// anchored on the profile's node_modules via createRequire, so the script runs
// from anywhere (Node >= 22.12 required for require() of ESM).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', 'web')
const patchPath = process.argv[2] ?? join(profileDir, 'cordis.patch.yml')
const baseUrl = process.argv[3] ?? pathToFileURL(join(profileDir, 'cordis.yml')).href
// Anchor bare-specifier resolution on the profile's node_modules.
const require = createRequire(pathToFileURL(join(dshHome, 'profiles', 'node_modules', 'package.json')))
const yaml = require('js-yaml')
const { Context } = require('@deepseek-ai/cordis')
const { Loader } = require('@deepseek-ai/cordis-plugin-loader')

const rows = yaml.load(readFileSync(patchPath, 'utf8'))
if (!Array.isArray(rows)) throw new Error(`${patchPath} must contain a YAML array of rows`)

const ctx = new Context()
const loader = new Loader(ctx, { baseUrl })
const registered = []
ctx.provide('tools', {
  register: (def) => {
    registered.push(def.name)
    return () => {}
  },
})

let failures = 0
for (const row of rows) {
  if (row.group === true || row.name === undefined) continue
  const url = new URL(row.name, baseUrl).href
  let mod
  try {
    mod = await import(url)
  } catch (error) {
    console.log(`IMPORT FAIL  ${row.id}  ${row.name}: ${error.message}`)
    failures++
    continue
  }
  const plugin = loader.unwrapExports(mod)
  if (plugin === null || typeof plugin !== 'object' || typeof plugin.apply !== 'function') {
    console.log(`SHAPE FAIL   ${row.id}: unwrapExports did not yield an apply function`)
    failures++
    continue
  }
  try {
    await plugin.apply(ctx)
  } catch (error) {
    console.log(`APPLY FAIL   ${row.id} (${plugin.name ?? '?'}): ${error.message}`)
    failures++
    continue
  }
  console.log(`OK           ${row.id} -> ${plugin.name}  inject=${JSON.stringify(plugin.inject ?? [])}`)
}

console.log(`\nregistered tools (${registered.length}): ${[...registered].sort().join(', ')}`)
console.log(failures === 0 ? 'LOAD PATH: ALL ROWS APPLY' : `LOAD PATH: ${failures} ROW(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
