// visual_capture — Designer toolset.
// visual_capture: headless screenshots via Playwright (npx playwright screenshot).
// design_tokens_parser: flatten Design Tokens from CSS variables, Tailwind
//   configs, or JSON token files into a flat name->value map.
// a11y_validator: axe-core CLI scan of a URL, with a saved JSON report.
// All commands run through the harness shell; graceful degradation when the
// external CLI is missing or the target is unreachable.
// Plain JavaScript for the dynamic Cordis Host half. No TS/JSX/import.
return {
  apply(ctx) {
    const CAPTURE_TIMEOUT_MS = 120000
    const OUTPUT_MAX_BYTES = 32768
    const MAX_TOKEN_BYTES = 1024 * 1024

    async function runCommand(exec, command, timeoutMs) {
      const shell = ctx.get('shell')
      if (shell === undefined) throw new Error('visual_capture: shell service unavailable')
      const cwd = exec.agent?.session.header.cwd
      const spec = shell.resolve({
        command,
        ...(cwd !== undefined ? { workdir: cwd } : {}),
        timeoutMs,
        stdoutMaxBytes: OUTPUT_MAX_BYTES,
        signal: exec.signal,
      })
      return shell.run(spec)
    }

    async function resolveTarget(exec, path) {
      const fs = ctx.get('fs')
      if (fs === undefined) throw new Error('visual_capture: filesystem service unavailable')
      const cwd = exec.agent?.session.header.cwd
      return fs.resolve(path, { ...(cwd !== undefined ? { cwd } : {}), signal: exec.signal })
    }

    function tail(text, maxLines) {
      const lines = text.split(/\r?\n/)
      return lines.slice(-maxLines).join('\n')
    }

    // ── visual_capture ──────────────────────────────────────────────────────
    const captureTool = harness.defineTool({
      name: 'visual_capture',
      description: 'Capture a headless screenshot of a URL (or local file) with Playwright and save it to an output path. Returns the saved file path and size. Requires npx + Playwright (auto-installed on first use via npx -y).',
      parameters: {
        url: { type: 'string', required: true, description: 'URL (http/https) or local path to capture.' },
        output_path: { type: 'string', required: true, description: 'Output file path (.png recommended); relative paths resolve against the session workspace.' },
        width: { type: 'number', description: 'Viewport width (default 1280).' },
        height: { type: 'number', description: 'Viewport height (default 720).' },
        full_page: { type: 'boolean', description: 'Capture the full scrollable page (default false).' },
        timeout_ms: { type: 'number', description: `Command timeout (default ${CAPTURE_TIMEOUT_MS}ms).` },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', required: true },
            outputPath: { type: 'string', required: true },
            bytes: { type: 'integer' },
            success: { type: 'boolean', required: true },
            stdout: { type: 'string', required: true },
            stderr: { type: 'string', required: true },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: value.success
            ? `captured ${value.url} -> ${value.outputPath}${value.bytes !== undefined ? ` (${value.bytes} bytes)` : ''}`
            : `capture FAILED for ${value.url}${value.note !== undefined ? `\nnote: ${value.note}` : ''}${value.stderr.trim().length > 0 ? `\n[stderr]\n${value.stderr}` : ''}`,
        }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const fs = ctx.get('fs')
        if (fs === undefined) throw new Error('visual_capture: filesystem service unavailable')
        const outputTarget = await resolveTarget(exec, args.output_path)
        const width = Math.max(320, Math.floor(args.width ?? 1280))
        const height = Math.max(240, Math.floor(args.height ?? 720))
        const timeoutMs = Math.min(Math.max(5000, Math.floor(args.timeout_ms ?? CAPTURE_TIMEOUT_MS)), 600000)
        const viewport = `--viewport-size=${width},${height}`
        const fullPage = args.full_page === true ? ' --full-page' : ''
        const command = `npx -y playwright screenshot ${viewport}${fullPage} "${args.url}" "${outputTarget.displayPath}"`

        let result
        try {
          result = await runCommand(exec, command, timeoutMs)
        } catch (error) {
          return {
            url: args.url,
            outputPath: outputTarget.displayPath,
            success: false,
            stdout: '',
            stderr: '',
            note: `playwright invocation failed: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
        const info = await fs.stat(outputTarget, exec.signal)
        const success = info !== undefined && info.type === 'file'
        return {
          url: args.url,
          outputPath: outputTarget.displayPath,
          ...(info?.size !== undefined ? { bytes: info.size } : {}),
          success,
          stdout: tail(result.stdout.text, 20),
          stderr: tail(result.stderr.text, 20),
          ...(success ? {} : { note: `playwright exited ${result.exitCode} and produced no file at ${outputTarget.displayPath}` }),
        }
      },
    })

    // ── design_tokens_parser ────────────────────────────────────────────────
    const tokensTool = harness.defineTool({
      name: 'design_tokens_parser',
      description: 'Flatten design tokens from a source file into a flat name -> value map: CSS custom properties (:root { --x: v; }), Tailwind config theme blocks, or JSON token files (style-dictionary style). Read-only, bounded.',
      parameters: {
        path: { type: 'string', required: true, description: 'Token source file; relative paths resolve against the session workspace.' },
        kind: { type: 'string', enum: ['auto', 'css', 'tailwind', 'json'], description: 'Source dialect (default auto by extension).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            kind: { type: 'string', required: true },
            count: { type: 'integer', required: true },
            tokens: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', required: true },
                  value: { type: 'string', required: true },
                },
              },
            },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: `${value.path} (${value.kind}) — ${value.count} token${value.count === 1 ? '' : 's'}${value.note !== undefined ? `\nnote: ${value.note}` : ''}\n${value.tokens.map((t) => `${t.name} = ${t.value}`).join('\n')}`,
        }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const fs = ctx.get('fs')
        if (fs === undefined) throw new Error('visual_capture: filesystem service unavailable')
        const target = await resolveTarget(exec, args.path)
        const info = await fs.stat(target, exec.signal)
        if (info === undefined || info.type !== 'file') throw new Error(`design_tokens_parser: "${target.displayPath}" not found`)
        if (info.size !== undefined && info.size > MAX_TOKEN_BYTES) {
          throw new Error(`design_tokens_parser: "${target.displayPath}" is too large (${info.size} bytes)`)
        }
        const text = await fs.readText(target, exec.signal)
        let kind = args.kind === 'auto' || args.kind === undefined ? undefined : args.kind
        if (kind === undefined) {
          kind = /\.json$/u.test(target.displayPath) ? 'json' : /tailwind/u.test(target.displayPath) ? 'tailwind' : 'css'
        }

        const tokens = []
        let note
        if (kind === 'css') {
          const re = /--([\w-]+)\s*:\s*([^;]+);/gu
          let m
          while ((m = re.exec(text)) !== null) tokens.push({ name: `--${m[1]}`, value: m[2].trim() })
        } else if (kind === 'json') {
          let parsed
          try {
            parsed = JSON.parse(text)
          } catch {
            return { path: target.displayPath, kind, count: 0, tokens: [], note: 'file is not valid JSON' }
          }
          const flatten = (node, prefix) => {
            if (node === null || typeof node !== 'object') return
            for (const [key, value] of Object.entries(node)) {
              const name = prefix.length === 0 ? key : `${prefix}.${key}`
              if (value !== null && typeof value === 'object') flatten(value, name)
              else tokens.push({ name, value: String(value) })
            }
          }
          flatten(parsed, '')
        } else {
          // tailwind: approximate — key: value pairs inside the theme block
          const themeStart = text.indexOf('theme')
          const slice = themeStart >= 0 ? text.slice(themeStart) : text
          const re = /([\w-]+)\s*:\s*(['"][^'"]+['"]|[#\w().,%\[\]\/\-]+)/gu
          let m
          while ((m = re.exec(slice)) !== null && tokens.length < 300) {
            tokens.push({ name: m[1], value: m[2] })
          }
          note = 'tailwind parsing is approximate (regex over the theme block); confirm values with chunk_reader'
        }

        return {
          path: target.displayPath,
          kind,
          count: tokens.length,
          tokens: tokens.slice(0, 500),
          ...(note !== undefined ? { note } : {}),
        }
      },
    })

    // ── a11y_validator ──────────────────────────────────────────────────────
    const a11yTool = harness.defineTool({
      name: 'a11y_validator',
      description: 'Run an accessibility scan of a URL with axe-core (npx @axe-core/cli) and report violation counts, optionally saving the JSON report. Requires npx + network access to the target.',
      parameters: {
        url: { type: 'string', required: true, description: 'URL to scan (http/https).' },
        output_path: { type: 'string', description: 'Optional path to save the JSON report.' },
        timeout_ms: { type: 'number', description: `Command timeout (default ${CAPTURE_TIMEOUT_MS}ms).` },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', required: true },
            exitCode: { type: 'integer' },
            violations: { type: 'integer' },
            reportPath: { type: 'string' },
            stdout: { type: 'string', required: true },
            stderr: { type: 'string', required: true },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: `a11y scan of ${value.url}${value.violations !== null ? ` — ${value.violations} violation${value.violations === 1 ? '' : 's'}` : ''}${value.reportPath !== undefined ? `\nreport: ${value.reportPath}` : ''}${value.note !== undefined ? `\nnote: ${value.note}` : ''}${value.stdout.trim().length > 0 ? `\n${value.stdout}` : ''}`,
        }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const fs = ctx.get('fs')
        if (fs === undefined) throw new Error('visual_capture: filesystem service unavailable')
        const timeoutMs = Math.min(Math.max(5000, Math.floor(args.timeout_ms ?? CAPTURE_TIMEOUT_MS)), 600000)
        let reportTarget
        let saveArg = ''
        if (typeof args.output_path === 'string' && args.output_path.trim().length > 0) {
          reportTarget = await resolveTarget(exec, args.output_path)
          saveArg = ` --save "${reportTarget.displayPath}"`
        }
        const command = `npx -y @axe-core/cli "${args.url}"${saveArg} --exit`

        let result
        try {
          result = await runCommand(exec, command, timeoutMs)
        } catch (error) {
          return {
            url: args.url,
            stdout: '',
            stderr: '',
            note: `axe-cli invocation failed: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
        const combined = `${result.stdout.text}\n${result.stderr.text}`
        const match = /(\d+)\s+violations?/iu.exec(combined)
        const violations = match !== null ? Number.parseInt(match[1], 10) : result.exitCode === 0 ? 0 : null
        const reportSaved = reportTarget !== undefined
        const savedInfo = reportSaved ? await fs.stat(reportTarget, exec.signal) : undefined
        return {
          url: args.url,
          ...(result.exitCode !== null ? { exitCode: result.exitCode } : {}),
          ...(violations !== null ? { violations } : {}),
          ...(reportTarget !== undefined && savedInfo !== undefined && savedInfo.type === 'file'
            ? { reportPath: reportTarget.displayPath }
            : {}),
          stdout: tail(result.stdout.text, 30),
          stderr: tail(result.stderr.text, 20),
          ...(result.exitCode !== 0 && match === null ? { note: 'axe-cli reported a nonzero exit without a parseable violation count' } : {}),
        }
      },
    })

    ctx.effect(() => harness.registerTool(ctx, captureTool))
    ctx.effect(() => harness.registerTool(ctx, tokensTool))
    ctx.effect(() => harness.registerTool(ctx, a11yTool))
  },
}
