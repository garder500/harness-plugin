// diagram_renderer — Mermaid / PlantUML rendering.
// Writes the diagram source into the workspace and tries to render it to
// SVG/PNG with the matching CLI (npx @mermaid-js/mermaid-cli, plantuml).
// Renders are best-effort: a missing CLI never fails the call — the source is
// kept and the note explains how to render later.
// Plain JavaScript for the dynamic Cordis Host half. No TS/JSX/import.
return {
  apply(ctx) {
    const RENDER_TIMEOUT_MS = 120000
    const RENDER_OUTPUT_MAX_BYTES = 65536

    function sanitizeSegment(value) {
      return String(value).replace(/[^A-Za-z0-9_-]/gu, '-').slice(0, 64)
    }

    async function runCommand(exec, command) {
      const shell = ctx.get('shell')
      if (shell === undefined) throw new Error('diagram_renderer: shell service unavailable')
      const cwd = exec.agent?.session.header.cwd
      const spec = shell.resolve({
        command,
        ...(cwd !== undefined ? { workdir: cwd } : {}),
        timeoutMs: RENDER_TIMEOUT_MS,
        stdoutMaxBytes: RENDER_OUTPUT_MAX_BYTES,
        signal: exec.signal,
      })
      return shell.run(spec)
    }

    const tool = harness.defineTool({
      name: 'diagram_renderer',
      description: 'Render a Mermaid or PlantUML diagram to SVG/PNG. Writes the source into the workspace (diagrams/) and invokes the matching CLI (npx @mermaid-js/mermaid-cli or plantuml). If the CLI is unavailable or rendering fails, the source file is kept and the note explains how to render — the call itself never fails on a missing renderer.',
      parameters: {
        source: { type: 'string', required: true, description: 'The diagram source (Mermaid or PlantUML).' },
        kind: { type: 'string', enum: ['mermaid', 'plantuml'], description: 'Diagram dialect (default mermaid).' },
        output: { type: 'string', description: 'Optional output path for the rendered file; defaults to diagrams/<id>.<format> in the session workspace.' },
        format: { type: 'string', enum: ['svg', 'png'], description: 'Output format (default svg).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', required: true },
            sourcePath: { type: 'string', required: true },
            outputPath: { type: 'string' },
            rendered: { type: 'boolean', required: true },
            bytes: { type: 'integer' },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const lines = [`diagram_renderer — ${value.kind}`, `source: ${value.sourcePath}`]
          if (value.rendered) {
            lines.push(`rendered: ${value.outputPath}${value.bytes !== undefined ? ` (${value.bytes} bytes)` : ''}`)
          } else {
            lines.push('render: NOT rendered')
          }
          if (value.note !== undefined) lines.push(`note: ${value.note}`)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const fs = ctx.get('fs')
        if (fs === undefined) throw new Error('diagram_renderer: filesystem service unavailable')
        if (typeof args.source !== 'string' || args.source.trim().length === 0) {
          throw new Error('diagram_renderer: source must be a non-empty string')
        }
        const kind = args.kind === 'plantuml' ? 'plantuml' : 'mermaid'
        const format = args.format === 'png' ? 'png' : 'svg'
        const cwd = exec.agent?.session.header.cwd
        const ext = kind === 'mermaid' ? 'mmd' : 'puml'
        const id = sanitizeSegment(exec.callId)
        const sourceRel = `diagrams/${id}.${ext}`
        const sourceTarget = await fs.resolve(sourceRel, { ...(cwd !== undefined ? { cwd } : {}), signal: exec.signal })
        await fs.writeText(sourceTarget, args.source)

        let outputTarget
        if (typeof args.output === 'string' && args.output.trim().length > 0) {
          outputTarget = await fs.resolve(args.output, { ...(cwd !== undefined ? { cwd } : {}), signal: exec.signal })
        } else {
          outputTarget = await fs.resolve(`diagrams/${id}.${format}`, { ...(cwd !== undefined ? { cwd } : {}), signal: exec.signal })
        }

        const command = kind === 'mermaid'
          ? `npx -y @mermaid-js/mermaid-cli -i "${sourceTarget.displayPath}" -o "${outputTarget.displayPath}" -b white`
          : `npx -y plantuml-cli -tsvg "${sourceTarget.displayPath}"`

        let result
        try {
          result = await runCommand(exec, command)
        } catch (error) {
          return {
            kind,
            sourcePath: sourceTarget.displayPath,
            rendered: false,
            note: `renderer invocation failed: ${error instanceof Error ? error.message : String(error)}`,
          }
        }

        const stderr = result.stderr.text.trim()
        if (result.exitCode !== 0) {
          return {
            kind,
            sourcePath: sourceTarget.displayPath,
            rendered: false,
            note: `renderer exited ${result.exitCode}${stderr.length > 0 ? `: ${stderr.slice(0, 400)}` : ''}. Install with: npm i -g ${kind === 'mermaid' ? '@mermaid-js/mermaid-cli' : 'plantuml-cli'}`,
          }
        }

        const info = await fs.stat(outputTarget, exec.signal)
        if (info === undefined || info.type !== 'file') {
          return {
            kind,
            sourcePath: sourceTarget.displayPath,
            rendered: false,
            note: `renderer reported success but no output file found at ${outputTarget.displayPath}`,
          }
        }

        return {
          kind,
          sourcePath: sourceTarget.displayPath,
          outputPath: outputTarget.displayPath,
          rendered: true,
          bytes: info.size,
        }
      },
    })

    ctx.effect(() => harness.registerTool(ctx, tool))
  },
}
