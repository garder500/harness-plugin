// __internal-test.mjs — decisive test: does the Loader's INTERNAL import branch
// (the one the live harness uses, via node-addon-require-builtin) resolve the
// baseUrl-relative row names? Compares: loader.internal.import(name, baseUrl)
// vs the standard new URL(name, baseUrl) import.
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(pathToFileURL(join(homedir(), '.dsh', 'profiles', 'node_modules', 'package.json')))
const { Context } = require('@deepseek-ai/cordis')
const { Loader } = require('@deepseek-ai/cordis-plugin-loader')

const baseUrl = pathToFileURL(join(homedir(), '.dsh', 'profiles', 'web', 'cordis.yml')).href
const ctx = new Context()
const loader = new Loader(ctx, { baseUrl })

console.log('internal loader available:', loader.internal !== undefined, loader.internal ? `(version ${loader.internal.version})` : '')

const name = './plugins/tree_inspector/index.js'
if (loader.internal !== undefined) {
  try {
    const mod = await loader.internal.import(name, baseUrl, {})
    const plugin = loader.unwrapExports(mod)
    console.log('INTERNAL BRANCH: OK ->', plugin?.name, typeof plugin?.apply)
  } catch (error) {
    console.log('INTERNAL BRANCH: FAIL ->', error.message)
  }
} else {
  console.log('INTERNAL BRANCH: skipped (no internal loader in this process)')
}
try {
  const mod = await import(new URL(name, baseUrl).href)
  console.log('STANDARD BRANCH: OK ->', loader.unwrapExports(mod)?.name)
} catch (error) {
  console.log('STANDARD BRANCH: FAIL ->', error.message)
}
