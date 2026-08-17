# mcp

MCP server connections owned by this repo. One YAML fragment per server, each a single
`@deepseek-ai/dsh-mcp-client` plugin row ready to splice into a composition.

## Config schema

```yaml
- id: <unique-row-id>
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: <unique server namespace, e.g. 'github'>
    # stdio transport — spawns a child process
    transport: stdio
    command: <executable>
    args: [<arg>, ...]
    env: { KEY: value }        # merged over the harness environment
    cwd: <optional working directory>
    # or streamable-http transport — connects over HTTP
    # transport: streamable-http
    # url: https://...
    # headers: { Authorization: 'Bearer ...' }
    #
    # optional tuning
    toolCallTimeoutMs: 60000
    failOnStartupError: false  # throw at load when the first connect/tool sync fails
    reconnect:                 # defaults apply when omitted
      enabled: true
      initialDelayMs: 1000
      maxDelayMs: 30000
      maxAttempts: 10
```

Rules enforced by the plugin (from `packages/mcp/mcp-client`):

- `serverName` must be unique across every `mcp-client` instance; duplicates fail at load.
- One instance per server: load multiple rows for multiple servers.
- `env` entries are credential references resolved through the harness credentials service — never
  commit plaintext secrets here; use a reference (e.g. `{ $ref: credentials.env.SOME_KEY }` if the
  harness resolves them that way, or an environment variable name).

## Wiring into the host composition

The `web` profile composes from bundles plus `cordis.patch.yml`. To activate a connection, add its
row to `%DSH_HOME%\profiles\web\cordis.patch.yml` (or a bundle that owns it), then restart the
harness. The repo owns the fragments; the patch file owns the wiring — keep the fragments here so
they survive profile reinstallation.

## Current connections

None configured yet. Add the first connection as `mcp/<server-name>.yml` following the schema
above, then wire it in.
