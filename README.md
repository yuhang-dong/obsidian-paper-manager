# Paper Manager

Paper Manager is an Obsidian plugin for organizing, reading, annotating, and synthesizing academic papers.

This repository currently contains the MVP scaffold:

- A custom paper library view.
- A table shell for future PDF metadata.
- A configurable vault folder for imported papers.
- Current Obsidian TypeScript, esbuild, ESLint, versioning, and release workflows.

## Development

Requirements:

- Node.js 20 or newer.
- A development Obsidian vault.

Install dependencies and build the plugin:

```bash
npm install
npm run build
```

For watch mode:

```bash
npm run dev
```

To build and deploy directly to a local development vault, copy
`local.config.example.json` to `local.config.json`, set its absolute
`vaultPath`, then run:

```bash
npm run build:obsidian
```

For continuous development builds, install and enable the Obsidian
[Hot Reload](https://github.com/pjeby/hot-reload) plugin once, then run:

```bash
npm run dev:obsidian
```

This command writes development builds directly to the configured vault,
syncs changes to `manifest.json` and `styles.css`, and creates the `.hotreload`
marker used by the Hot Reload plugin. Stop it with `Ctrl+C`.

You can override the configured vault for a single invocation with the
`OBSIDIAN_VAULT_PATH` environment variable.

Copy or link `manifest.json`, `main.js`, and `styles.css` into:

```text
<vault>/.obsidian/plugins/paper-manager/
```

Reload Obsidian, enable the plugin, then use the ribbon icon or the command palette action “Open paper library”.

## Planned MVP

- Drag-and-drop PDF import and metadata extraction.
- Sorting, filtering, searching, and multi-selection.
- Embedded PDF reading and sidecar annotations.
- Paid AI paper analysis and multi-paper presentation generation.

## License

No license has been selected yet. Update `package.json` and add a license file before public distribution.
