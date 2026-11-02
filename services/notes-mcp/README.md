# Textus notes MCP server

Gives a desktop AI - Claude Desktop, Claude Code, or Textus's own AI - the
Markdown notes in one folder. Tools: `list_notes`, `read_note`,
`search_notes`, `write_note`, `append_note`. Plain Node 22, no install step.

Every path is relative to the folder you give it; a path that leaves it (`..`,
a symlink out) is refused. Set `TEXTUS_NOTES_READ_ONLY=1` to offer only the
three reading tools.

## Claude Desktop

Settings → Developer → Edit Config, then add (Windows paths shown):

```json
{
  "mcpServers": {
    "textus-notes": {
      "command": "node",
      "args": ["C:\\path\\to\\Textus\\services\\notes-mcp\\server.mjs", "O:\\_Theophysics_v5"]
    }
  }
}
```

Restart Claude Desktop; the tools show under the plug icon.

## Claude Code

```sh
claude mcp add textus-notes -- node /path/to/Textus/services/notes-mcp/server.mjs /path/to/notes
```

## Textus

Settings → Extensions → MCP servers → add a command:
`node /path/to/services/notes-mcp/server.mjs /path/to/notes`.
