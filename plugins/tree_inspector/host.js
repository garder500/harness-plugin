// tree_inspector — hierarchical index with estimated block sizes.
// Returns ONLY the shape (directory tree or document TOC), never file contents.
// Plain JavaScript for the dynamic Cordis Host half. No TS/JSX/import.
return {
  apply(ctx) {
    const DEFAULT_MAX_DEPTH = 3
    const MAX_DEPTH = 8
    const MAX_NODES = 1000
    const MAX_TOC_BYTES = 512 * 1024
    const TOC_LINE_CAP = 5000
    const MAX_TOC_ENTRIES = 200
    const CHARS_PER_TOKEN = 4

    function estTokens(bytes) {
      return bytes === undefined ? undefined : Math.ceil(bytes / CHARS_PER_TOKEN)
    }

    function joinDisplay(parentPath, name) {
      const hasSep = parentPath.endsWith('/') || parentPath.endsWith('\\')
      return hasSep ? parentPath + name : parentPath + '/' + name
    }

    function renderTree(value) {
      const head = value.kind === 'directory'
        ? `${value.root} (directory, ${value.totalFiles} file${value.totalFiles === 1 ? '' : 's'}${value.estTokens !== undefined ? `, ~${value.estTokens} tokens` : ''})`
        : `${value.root} (file${value.totalBytes !== undefined ? `, ${value.totalBytes} bytes` : ''}${value.estTokens !== undefined ? `, ~${value.estTokens} tokens` : ''})`
      const lines = [head]
      if (value.kind === 'directory') {
        for (const entry of value.entries) {
          const indent = '  '.repeat(entry.depth)
          const suffix = entry.type === 'directory' ? ' (directory)' : ''
          const size = entry.estTokens !== undefined ? `, ~${entry.estTokens} tokens` : ''
          lines.push(`${indent}${entry.name}${suffix}${size}`)
        }
      } else {
        for (const toc of value.toc) {
          lines.push(`${String(toc.line).padStart(5)} | ~${toc.estTokens}t | ${toc.text}`)
        }
      }
      if (value.truncated) lines.push('(listing truncated — narrow path or reduce max_depth)')
      if (value.note !== undefined) lines.push(`(note: ${value.note})`)
      return lines.join('\n')
    }

    const tool = harness.defineTool({
      name: 'tree_inspector',
      description: 'Return the hierarchical structure of a directory or the table of contents of a text file, with estimated token sizes per block. Never returns file contents — use it to decide where to look next, then read only the interesting slice with chunk_reader or grep_search.',
      parameters: {
        path: { type: 'string', required: true, description: 'File or directory to index; relative paths resolve against the session workspace.' },
        max_depth: { type: 'number', description: 'Directory recursion depth (default 3, max 8). Ignored for files.' },
        include_token_estimates: { type: 'boolean', description: 'Whether to compute estimated token counts per entry (default true).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            root: { type: 'string', required: true },
            kind: { type: 'string', required: true, enum: ['directory', 'file'] },
            entries: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  depth: { type: 'integer', required: true },
                  name: { type: 'string', required: true },
                  type: { type: 'string', required: true },
                  path: { type: 'string', required: true },
                  size: { type: 'integer' },
                  estTokens: { type: 'integer' },
                },
              },
            },
            toc: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  line: { type: 'integer', required: true },
                  text: { type: 'string', required: true },
                  estTokens: { type: 'integer', required: true },
                },
              },
            },
            totalFiles: { type: 'integer', required: true },
            totalBytes: { type: 'integer' },
            estTokens: { type: 'integer' },
            truncated: { type: 'boolean', required: true },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: renderTree(value) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const fs = ctx.get('fs')
        if (fs === undefined) throw new Error('tree_inspector: filesystem service unavailable')
        const cwd = exec.agent?.session.header.cwd
        const target = await fs.resolve(args.path, {
          ...(cwd !== undefined ? { cwd } : {}),
          signal: exec.signal,
        })
        const info = await fs.stat(target, exec.signal)
        if (info === undefined) throw new Error(`tree_inspector: "${target.displayPath}" not found`)
        const includeTokens = args.include_token_estimates !== false

        if (info.type === 'directory') {
          const maxDepth = Math.min(Math.max(1, Math.floor(args.max_depth ?? DEFAULT_MAX_DEPTH)), MAX_DEPTH)
          const budget = { nodes: 0, files: 0, bytes: 0, tokens: 0, truncated: false }
          const tree = await (async function walk(dirTarget, depth, displayPath) {
            let list
            try {
              list = await fs.listDir(dirTarget, exec.signal)
            } catch {
              budget.truncated = true
              return []
            }
            const children = []
            for (const entry of list) {
              if (budget.nodes >= MAX_NODES) { budget.truncated = true; break }
              budget.nodes++
              const path = joinDisplay(displayPath, entry.name)
              const row = { depth, name: entry.name, type: entry.type, path }
              if (entry.type === 'file') {
                budget.files++
                if (entry.size !== undefined) {
                  budget.bytes += entry.size
                  row.size = entry.size
                  if (includeTokens) row.estTokens = estTokens(entry.size)
                }
              } else if (entry.type === 'directory' && depth < maxDepth) {
                let nested = []
                try { nested = await walk(entry.target, depth + 1, path) } catch { budget.truncated = true }
                if (nested.length > 0) row.children = nested
              }
              children.push(row)
            }
            return children
          })(target, 0, target.displayPath)

          const flat = []
          const pushFlat = (nodes) => {
            for (const node of nodes) {
              flat.push({
                depth: node.depth,
                name: node.name,
                type: node.type,
                path: node.path,
                size: node.size,
                estTokens: node.estTokens,
              })
              if (node.children !== undefined) pushFlat(node.children)
            }
          }
          pushFlat(tree)
          const totalBytes = budget.bytes
          const totalTokens = includeTokens ? Math.ceil(totalBytes / CHARS_PER_TOKEN) : undefined
          return {
            root: target.displayPath,
            kind: 'directory',
            entries: flat,
            totalFiles: budget.files,
            totalBytes: totalBytes === 0 ? undefined : totalBytes,
            estTokens: totalTokens,
            truncated: budget.truncated,
          }
        }

        // Regular file: build a table of contents from heading-like lines.
        const isBig = info.size !== undefined && info.size > MAX_TOC_BYTES
        const toc = []
        let truncated = false
        let note
        if (isBig) {
          note = `file is ${info.size} bytes — too large for a TOC; use chunk_reader or grep_search on this path`
        } else {
          const text = await fs.readText(target, exec.signal)
          const lines = text.split(/\r?\n/)
          const headRe = /^\s{0,3}(#{1,6}\s|def\s|class\s|function\s|const\s|let\s|var\s|export\s|interface\s|type\s|fn\s|func\s|public\s|private\s|protected\s|async\s)/u
          for (let i = 0; i < Math.min(lines.length, TOC_LINE_CAP); i++) {
            if (headRe.test(lines[i])) {
              toc.push({ line: i + 1, text: lines[i].slice(0, 120), estTokens: estTokens(lines[i].length) })
              if (toc.length >= MAX_TOC_ENTRIES) { truncated = true; break }
            }
          }
          if (lines.length > TOC_LINE_CAP) truncated = true
        }
        return {
          root: target.displayPath,
          kind: 'file',
          toc,
          totalFiles: 1,
          totalBytes: info.size,
          estTokens: estTokens(info.size),
          truncated,
          ...(note !== undefined ? { note } : {}),
        }
      },
    })

    ctx.effect(() => harness.registerTool(ctx, tool))
  },
}
