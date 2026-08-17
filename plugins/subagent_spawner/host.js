// subagent_spawner — disposable fresh-context subagent with a strict summary.
// Spawns a child in a blank context (fresh KV cache) to do laborious
// exploration, then returns only a word-capped summary to the parent.
// Plain JavaScript for the dynamic Cordis Host half. No TS/JSX/import.
return {
  apply(ctx) {
    const DEFAULT_MAX_WORDS = 100
    const HARD_MAX_WORDS = 500
    const INLINE_CAP_CHARS = 4000

    function countWords(text) {
      const trimmed = text.trim()
      return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length
    }

    function enforceCap(text, cap) {
      const trimmed = text.trim()
      const words = trimmed.split(/\s+/u)
      if (words.length <= cap) return { summary: trimmed, truncated: false }
      return { summary: `${words.slice(0, cap).join(' ')} …(truncated)`, truncated: true }
    }

    function buildPrompt(instruction, artifacts, maxWords) {
      const parts = [
        'You are a disposable exploration subagent. Complete the assigned subtask using your own tools and context, then STOP. You will never be asked follow-up questions.',
        '',
        'SUBTASK:',
        instruction,
      ]
      if (Array.isArray(artifacts) && artifacts.length > 0) {
        parts.push('', 'CONTEXT ARTIFACTS:')
        for (const artifact of artifacts) {
          if (typeof artifact.content === 'string' && artifact.content.length > 0) {
            const inline = artifact.content.length > INLINE_CAP_CHARS
              ? `${artifact.content.slice(0, INLINE_CAP_CHARS)}\n…(inline content truncated)`
              : artifact.content
            parts.push(`- ${artifact.path}:\n${inline}`)
          } else {
            parts.push(`- ${artifact.path} (read it with your read tool)`)
          }
        }
      }
      parts.push(
        '',
        `OUTPUT CONTRACT:`,
        `Reply with ONLY a plain-text summary of at most ${maxWords} words. No preamble, no headings, no code fences, no bullets. The parent agent reads this verbatim.`,
      )
      return parts.join('\n')
    }

    const tool = harness.defineTool({
      name: 'subagent_spawner',
      description: 'Launch a disposable subagent in a BLANK context (fresh KV cache) to perform laborious exploration, then return only a strict word-capped summary (default 100 words). Saves tens of thousands of tokens on the parent session: the child does the reading, the parent gets the distilled result.',
      parameters: {
        subtask_instruction: { type: 'string', required: true, description: 'Self-contained instruction for the disposable explorer. It does not see this conversation — include everything it needs.' },
        context_artifacts: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string', required: true, description: 'Path of the artifact; the child reads it with its own tools, or content is inlined below.' },
              content: { type: 'string', description: 'Optional inline content; when omitted the child reads the path itself.' },
            },
          },
          description: 'Files or snippets to hand the child (paths to read, or inline content).',
        },
        max_output_tokens: { type: 'number', description: `Maximum number of WORDS allowed in the returned summary (default ${DEFAULT_MAX_WORDS}, hard cap ${HARD_MAX_WORDS}).` },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            runId: { type: 'string', required: true },
            summary: { type: 'string', required: true },
            wordCount: { type: 'integer', required: true },
            truncated: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: `subagent ${value.runId} summary (${value.wordCount} words${value.truncated ? ', truncated' : ''}):\n${value.summary}`,
        }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const subagents = ctx.get('subagents')
        if (subagents === undefined) throw new Error('subagent_spawner: subagents service unavailable')
        const maxWords = args.max_output_tokens === undefined ? DEFAULT_MAX_WORDS : Math.floor(args.max_output_tokens)
        if (!Number.isFinite(maxWords) || maxWords < 1) throw new Error('subagent_spawner: max_output_tokens must be a positive integer')
        if (maxWords > HARD_MAX_WORDS) throw new Error(`subagent_spawner: max_output_tokens must be at most ${HARD_MAX_WORDS}`)
        const parent = exec.agent
        if (!parent) throw new Error('subagent_spawner requires a calling agent (exec.agent was undefined)')
        if (subagents.getProvider('spawn') === undefined) {
          throw new Error('subagent_spawner: the "spawn" subagent provider is not registered (is a subagent backend loaded?)')
        }

        const prompt = buildPrompt(args.subtask_instruction, args.context_artifacts, maxWords)
        const run = await subagents.start('spawn', {
          label: 'disposable-exploration',
          prompt: [{ type: 'text', text: prompt }],
          parent,
          signal: exec.signal,
        })

        let text = ''
        try {
          const result = await run.result
          text = result.output
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n')
        } catch (error) {
          throw new Error(`subagent_spawner: child run failed: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
          try { await run.dispose() } catch { /* disposal failure must not mask the summary */ }
        }

        const enforced = enforceCap(text, maxWords)
        return {
          runId: run.id,
          summary: enforced.summary,
          wordCount: countWords(enforced.summary),
          truncated: enforced.truncated,
        }
      },
    })

    ctx.effect(() => harness.registerTool(ctx, tool))
  },
}
