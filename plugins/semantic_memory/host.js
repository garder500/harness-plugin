// semantic_memory — workspace-scoped episodic memory with lexical recall.
// semantic_memory_recall queries a local memory store and returns only the few
// most relevant stored facts as bullets. memory_add persists new facts.
// No embeddings or network: a BM25-style lexical scorer over JSONL entries.
// Plain JavaScript for the dynamic Cordis Host half. No TS/JSX/import.
return {
  apply(ctx) {
    const MEMORY_DIR = '.dsh-memory'
    const MEMORY_FILE = 'memories.jsonl'
    const DEFAULT_TOP_K = 3
    const MAX_TOP_K = 10
    const DEFAULT_THRESHOLD = 0.05

    function tokenize(text) {
      return (String(text).toLowerCase().match(/[a-z0-9_]+/gu) ?? [])
    }

    function readEntriesSync(lines) {
      const entries = []
      for (const line of lines) {
        if (line.trim().length === 0) continue
        try {
          const entry = JSON.parse(line)
          if (entry !== null && typeof entry === 'object' && typeof entry.text === 'string') {
            entries.push(entry)
          }
        } catch {
          // skip malformed lines; the store stays usable
        }
      }
      return entries
    }

    function scoreEntries(queryTokens, entries) {
      const N = entries.length
      const docFrequency = new Map()
      const tokenSets = entries.map((entry) => {
        const tokens = tokenize(entry.text)
        const set = new Set(tokens)
        for (const token of set) docFrequency.set(token, (docFrequency.get(token) ?? 0) + 1)
        return { entry, tokens, set }
      })
      const scored = []
      for (const { entry, tokens, set } of tokenSets) {
        const counts = new Map()
        for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
        let score = 0
        for (const q of queryTokens) {
          if (!set.has(q)) continue
          const tf = counts.get(q)
          const df = docFrequency.get(q) ?? 0
          const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
          score += (tf / (tf + 1.2)) * idf
        }
        scored.push({ entry, score })
      }
      scored.sort((a, b) => b.score - a.score)
      return scored
    }

    function renderRecall(value) {
      const head = `semantic_memory_recall — ${value.results.length} fact${value.results.length === 1 ? '' : 's'} for "${value.query}"`
      if (value.results.length === 0) return `${head}\n(no facts above the score threshold; use memory_add to store facts)`
      const body = value.results.map((hit) => `- (score ${hit.score.toFixed(2)}) ${hit.text}`).join('\n')
      return `${head}\n\n${body}`
    }

    async function loadEntries(ctx, exec) {
      const fs = ctx.get('fs')
      if (fs === undefined) throw new Error('semantic_memory: filesystem service unavailable')
      const cwd = exec.agent?.session.header.cwd
      if (cwd === undefined) throw new Error('semantic_memory: no session workspace (exec.agent was undefined)')
      const file = await fs.resolve(`${MEMORY_DIR}/${MEMORY_FILE}`, { cwd, signal: exec.signal })
      const info = await fs.stat(file, exec.signal)
      let entries = []
      if (info !== undefined && info.type === 'file') {
        const text = await fs.readText(file, exec.signal)
        entries = readEntriesSync(text.split(/\r?\n/))
      }
      return { fs, cwd, file, entries }
    }

    const recallTool = harness.defineTool({
      name: 'semantic_memory_recall',
      description: `Query the workspace-scoped memory store and return only the ${DEFAULT_TOP_K}-ish most relevant stored facts (preferences, prior conclusions, extracted facts) as score-ordered bullet points. Scores are lexical (BM25-style over local JSONL entries); there are no embeddings and no network calls. Use memory_add to store facts.`,
      parameters: {
        query: { type: 'string', required: true, description: 'Free-text query to match against stored memory entries.' },
        top_k: { type: 'number', description: `Maximum number of facts to return (default ${DEFAULT_TOP_K}, max ${MAX_TOP_K}).` },
        score_threshold: { type: 'number', description: `Minimum lexical score for a fact to be returned (default ${DEFAULT_THRESHOLD}); raise to return only strong matches.` },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: { type: 'string', required: true },
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  score: { type: 'number', required: true },
                  text: { type: 'string', required: true },
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        render: (_args, value) => [{ type: 'text', text: renderRecall(value) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const { entries } = await loadEntries(ctx, exec)
        const queryTokens = tokenize(args.query)
        if (queryTokens.length === 0) return { query: args.query, results: [] }
        const topK = Math.min(Math.max(1, Math.floor(args.top_k ?? DEFAULT_TOP_K)), MAX_TOP_K)
        const threshold = args.score_threshold ?? DEFAULT_THRESHOLD
        const results = scoreEntries(queryTokens, entries)
          .filter((hit) => hit.score >= threshold)
          .slice(0, topK)
          .map((hit) => ({
            id: hit.entry.id,
            score: hit.score,
            text: hit.entry.text,
            ...(Array.isArray(hit.entry.tags) && hit.entry.tags.length > 0 ? { tags: hit.entry.tags } : {}),
          }))
        return { query: args.query, results }
      },
    })

    const addTool = harness.defineTool({
      name: 'memory_add',
      description: 'Store one fact (preference, conclusion, extracted knowledge) in the workspace-scoped memory store so semantic_memory_recall can return it in later sessions. Entries live in .dsh-memory/memories.jsonl inside the session workspace.',
      parameters: {
        text: { type: 'string', required: true, description: 'The fact to remember, as one self-contained sentence.' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags to help future queries (e.g. ["preference", "project:foo"]).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            stored: { type: 'boolean', required: true },
            entryCount: { type: 'integer', required: true },
            text: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: value.stored
            ? `stored memory ${value.id} (${value.entryCount} entries total): ${value.text}`
            : `memory_add failed for: ${value.text}`,
        }],
      },
      async execute(args, exec) {
        const { fs, cwd, file, entries } = await loadEntries(ctx, exec)
        const id = `m${entries.length + 1}`
        const entry = {
          id,
          text: args.text,
          ...(Array.isArray(args.tags) && args.tags.length > 0 ? { tags: args.tags } : {}),
        }
        const next = entries.length === 0 ? [entry] : [...entries, entry]
        const serialized = next.map((item) => JSON.stringify(item)).join('\n') + '\n'
        // The local fs provider creates missing parent directories on write.
        await fs.writeText(file, serialized)
        return { id, stored: true, entryCount: next.length, text: args.text }
      },
    })

    ctx.effect(() => harness.registerTool(ctx, recallTool))
    ctx.effect(() => harness.registerTool(ctx, addTool))
  },
}
