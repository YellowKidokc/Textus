# Textus notes MCP server

Gives a desktop AI - Claude Desktop, Claude Code, or Textus's own AI - the
Markdown notes in one folder. Tools: `list_notes`, `read_note`,
`search_notes`, `write_note`, `append_note`, `list_methods`,
`get_checklist`. Plain Node 22, no install step.

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

## Writing methods and series checklists

Keep your writing methods in `_methods.md` at the notes root (or point
`TEXTUS_METHODS_FILE` elsewhere). A `## ` heading starts each method;
`level: line` methods are checked sentence by sentence, `level: shape` ones
(title, hook, opening, closing) give a few options on demand. See
[example-methods.md](example-methods.md).

A series picks its three to five methods in a `_series.md` in its folder,
which can also hold the outline:

```md
methods: cut-the-words, hook-line

# Outline

- Human anchor
- Principle revealed
```

Ask Claude "check this note against its checklist", and it calls
`get_checklist` for the methods and outline that apply.

`node convert.mjs _methods.md > methods.json` turns the methods into JSON,
and `node convert.mjs methods.json > _methods.md` turns JSON back.
