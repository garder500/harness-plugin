#!/usr/bin/env node
// validate-presets.mjs — validate agent preset compositions the way
// @deepseek-ai/dsh-agent-presets discovery does: parse with the loader's YAML
// dialect (JSON_SCHEMA + the !!js expression tag) and check the entry-list
// shape (top-level array of plugin rows, each carrying a string `name`; groups
// recurse into their own row lists).
//
// Usage:
//   node scripts/validate-presets.mjs [rootDir ...]
// Root dirs default to ./presets. Each root is scanned for <id>/agent.cordis.yml.
// js-yaml is resolved through NODE_PATH (set it to the profile's node_modules,
// e.g. C:\Users\user\.dsh\profiles\node_modules) via createRequire.
import { createRequire } from 'node:module'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

// Mirror of cordis-plugin-include's entryListSchema.
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
})
const entryListSchema = yaml.JSON_SCHEMA.extend(JsExpr)

const COMPOSITION_FILE = 'agent.cordis.yml'

// Structural check mirroring discovery's entryListProblem.
function entryListProblem(rows, at = '') {
  if (!Array.isArray(rows)) {
    return at === ''
      ? 'the composition must be a top-level list of plugin rows'
      : `group ${at} must hold a list of plugin rows`
  }
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const label = at === '' ? `row ${index + 1}` : `${at} row ${index + 1}`
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return `${label} is not a plugin row (expected a map with a "name")`
    }
    if (typeof row.name !== 'string' || row.name === '') {
      return `${label} names no plugin (a "name" string is required)`
    }
    if (row.group === true) {
      const nested = entryListProblem(row.config, label)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

async function compositionProblem(path) {
  let content
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    return `the composition file ${COMPOSITION_FILE} cannot be read: ${error.message}`
  }
  let rows
  try {
    rows = yaml.load(content, { schema: entryListSchema })
  } catch (error) {
    return `the composition is not valid YAML: ${error.message.split('\n')[0]}`
  }
  return entryListProblem(rows)
}

async function scanRoot(root) {
  const dir = resolve(root)
  let children
  try {
    children = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    return { dir, presets: [], error: `cannot read ${dir}: ${error.message}` }
  }
  const presets = []
  for (const child of children) {
    if (!child.isDirectory()) continue
    const composition = join(dir, child.name, COMPOSITION_FILE)
    let info
    try {
      info = await stat(composition)
    } catch {
      continue // not a preset (no composition)
    }
    if (!info.isFile()) continue
    presets.push({ id: child.name, path: composition, broken: await compositionProblem(composition) })
  }
  presets.sort((a, b) => a.id.localeCompare(b.id))
  return { dir, presets }
}

const roots = process.argv.length > 2
  ? process.argv.slice(2)
  : [resolve(fileURLToPath(new URL('..', import.meta.url)), 'presets')]

let allOk = true
for (const root of roots) {
  const { dir, presets, error } = await scanRoot(root)
  console.log(`\n== ${dir}`)
  if (error !== undefined) {
    console.log(`  ${error}`)
    allOk = false
    continue
  }
  if (presets.length === 0) {
    console.log('  (no presets found)')
    continue
  }
  for (const preset of presets) {
    if (preset.broken === undefined) {
      console.log(`  OK      ${preset.id}  ${preset.path}`)
    } else {
      console.log(`  BROKEN  ${preset.id}  ${preset.path}\n          reason: ${preset.broken}`)
      allOk = false
    }
  }
}

console.log(allOk ? '\nALL PRESETS VALID' : '\nSOME PRESETS ARE BROKEN')
process.exit(allOk ? 0 : 1)
