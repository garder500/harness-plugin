// artifact_offloader — output virtualization middleware.
// Listens on the tools/post-execute waterfall: when a targeted execution tool
// (terminal, SQL, API...) returns more than thresholdTokens, the FULL payload
// is persisted to the harness spill store and the model receives only a
// truncated preview (first N / last M lines) plus the artifact locator, which
// grep_search / chunk_reader can then mine.
// Plain JavaScript for the dynamic Cordis Host half. No TS/JSX/import.
return {
  apply(ctx) {
    // ── defaults (tunable by editing these constants) ──────────────────────
    const THRESHOLD_TOKENS = 500
    const PREVIEW_HEAD_LINES = 10
    const PREVIEW_TAIL_LINES = 5
    const CHARS_PER_TOKEN = 4
    const TARGET_TOOLS = ['pwsh', 'bash', 'web_fetch', 'web_search']

    function estTokens(text) {
      return Math.ceil(text.length / CHARS_PER_TOKEN)
    }

    function buildPreview(text) {
      const lines = text.split(/\r?\n/)
      if (lines.length <= PREVIEW_HEAD_LINES + PREVIEW_TAIL_LINES) return text
      const head = lines.slice(0, PREVIEW_HEAD_LINES)
      const tail = lines.slice(-PREVIEW_TAIL_LINES)
      return `${head.join('\n')}\n… (${lines.length - PREVIEW_HEAD_LINES - PREVIEW_TAIL_LINES} lines omitted) …\n${tail.join('\n')}`
    }

    ctx.on('tools/post-execute', async (exec, result, next) => {
      // Always delegate first: the waterfall's own pipeline owns the result.
      const decision = await next()
      if (decision.kind !== 'accept') return decision
      // A value-replacement decision re-renders its own content afterwards;
      // rewriting the projection here would fight the replacing tool.
      if (decision.value !== undefined) return decision
      if (!TARGET_TOOLS.includes(exec.name)) return decision
      if (result.isError) return decision

      const effectiveContent = decision.content !== undefined ? decision.content : result.content
      if (!Array.isArray(effectiveContent)) return decision

      const text = effectiveContent
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      if (text.length === 0 || estTokens(text) <= THRESHOLD_TOKENS) return decision

      const sessionId = exec.agent?.session.header.id
      const spillStore = ctx.get('spillStore')
      if (sessionId === undefined || spillStore === undefined) return decision

      let ref
      try {
        ref = await spillStore.saveText({
          owner: { sessionId },
          source: { toolName: exec.name, callId: exec.callId, label: 'offload' },
          suggestedName: `exec-${exec.name}.txt`,
          content: text,
        })
      } catch (error) {
        // Best-effort: if the artifact cannot be saved, keep the full result
        // inline rather than failing the tool call.
        console.log(`artifact_offloader: saveText failed for ${exec.name}: ${String(error)}`)
        return decision
      }

      const preview = buildPreview(text)
      return {
        kind: 'accept',
        content: [{
          type: 'text',
          text: `[artifact_offloader] ${exec.name} returned ${estTokens(text)} tokens — full payload saved to artifact.\n\n${preview}\n\n(Full output saved at: ${ref.locator}. ${ref.retrievalHint} Use grep_search with target_file="${ref.locator}" or chunk_reader to mine it.)`,
        }],
      }
    })
  },
}
