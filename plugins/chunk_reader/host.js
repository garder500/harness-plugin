// chunk_reader — read only a delimited slice of a file (sliding window).
// Hard-caps the window so a whole file can never be loaded into the prompt.
// Plain JavaScript for the dynamic Cordis Host half. No TS/JSX/import.
return {
  apply(ctx) {
    const DEFAULT_LIMIT = 50
    const HARD_LIMIT = 100

    function render(value) {
      const head = `${value.path} — lines ${value.startLine}-${value.endLine} of ${value.totalLines}`
      if (value.lines.length === 0) return `${head}\n(empty window)`
      const body = value.lines.map((line) => `${String(line.number).padStart(6)} | ${line.text}`).join('\n')
      return `${head}\n\n${body}`
    }

    const tool = harness.defineTool({
      name: 'chunk_reader',
      description: `Read ONE bounded slice of a text file (default ${DEFAULT_LIMIT} lines, hard cap ${HARD_LIMIT} per call). Forces windowed reading: use start_line and limit_lines to page through a file instead of loading it whole.`,
      parameters: {
        file_path: { type: 'string', required: true, description: 'Path of the file to read; relative paths resolve against the session workspace.' },
        start_line: { type: 'number', required: true, description: '1-based first line of the window.' },
        limit_lines: { type: 'number', description: `Maximum number of lines to return (default ${DEFAULT_LIMIT}, hard cap ${HARD_LIMIT}).` },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            startLine: { type: 'integer', required: true },
            endLine: { type: 'integer', required: true },
            totalLines: { type: 'integer', required: true },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  number: { type: 'integer', required: true },
                  text: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render: (_args, value) => [{ type: 'text', text: render(value) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const fs = ctx.get('fs')
        if (fs === undefined) throw new Error('chunk_reader: filesystem service unavailable')
        const startLine = Math.floor(args.start_line)
        if (!Number.isFinite(startLine) || startLine < 1) throw new Error('chunk_reader: start_line must be a positive integer')
        const limitLines = args.limit_lines === undefined ? DEFAULT_LIMIT : Math.floor(args.limit_lines)
        if (!Number.isFinite(limitLines) || limitLines < 1) throw new Error('chunk_reader: limit_lines must be a positive integer')
        if (limitLines > HARD_LIMIT) throw new Error(`chunk_reader: limit_lines must be at most ${HARD_LIMIT}`)

        const cwd = exec.agent?.session.header.cwd
        const target = await fs.resolve(args.file_path, {
          ...(cwd !== undefined ? { cwd } : {}),
          signal: exec.signal,
        })
        const info = await fs.stat(target, exec.signal)
        if (info === undefined) throw new Error(`chunk_reader: "${target.displayPath}" not found`)
        if (info.type !== 'file') throw new Error(`chunk_reader: "${target.displayPath}" is not a regular file`)

        const text = await fs.readText(target, exec.signal)
        const lines = text.split(/\r?\n/)
        const totalLines = lines.length
        const from = startLine - 1
        const to = Math.min(from + limitLines, totalLines)
        const window = []
        for (let i = from; i < to; i++) window.push({ number: i + 1, text: lines[i] })

        return {
          path: target.displayPath,
          startLine,
          endLine: to,
          totalLines,
          lines: window,
        }
      },
    })

    ctx.effect(() => harness.registerTool(ctx, tool))
  },
}
