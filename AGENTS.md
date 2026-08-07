# Paper Manager development notes

## Product boundary

Paper Manager is an Obsidian-native academic paper library. Paper import,
organization, reading, and annotation are free/local features. AI extraction,
cross-paper synthesis, and presentation generation are paid features.

The first version stores each imported paper in a plugin-managed folder inside
the configured Vault library folder. The folder name is a generated stable UUID,
never a title or uploaded filename.

```text
<library-folder>/<paper-id>/
├── index.md
├── source.pdf
├── annotated.pdf
├── annotations.json
└── analysis.json
```

`paper_id` must also be stored in `index.md` frontmatter so identity survives a
user renaming or moving the folder. Store the original uploaded filename and a
SHA-256 hash separately; use the hash for duplicate detection, not identity.

## PDF source, editing, and native preview

Treat the PDF representations as separate layers:

- `source.pdf` is the immutable original and must never be overwritten.
- `annotations.json` is the canonical, editable annotation state used by
  EmbedPDF and by AI features. It should preserve selected text, page/geometry,
  comments, colors, and other structured context.
- `annotated.pdf` is a derived export produced from `source.pdf` plus the current
  annotations. It is safe to regenerate.
- `index.md` embeds `![[annotated.pdf]]`. Obsidian's native PDF viewer is the
  read-only/quick-preview surface; it does not read `annotations.json`.
- `analysis.json` stores structured AI output and is not the canonical source of
  user-authored annotations.

On initial import, write the uploaded bytes to both `source.pdf` and
`annotated.pdf` so the Markdown embed always targets a stable filename. Editing
must happen in a dedicated Paper Manager EmbedPDF view. Saving should first
persist the structured annotation export, then export/save the modified PDF to
`annotated.pdf` through Obsidian's Vault API. If PDF export fails, the JSON state
must remain sufficient to retry/regenerate the derived PDF.

Add an `Edit in Paper Manager` action to Obsidian's native PDF view for managed
`annotated.pdf` files. The action opens the dedicated reader/editor with the
paper ID and paths, rather than modifying the native PDF viewer DOM.

## Data access

Discover papers by scanning `<library-folder>/**/index.md` with the Vault API and
reading frontmatter from `MetadataCache`. Use `FileManager.processFrontMatter`
for metadata updates. Keep a runtime React/store index for table search, sorting,
and filtering rather than repeatedly reparsing every note during render.

Use the Vault API for visible Vault files, including `createBinary`,
`readBinary`, and `modifyBinary`. Do not store user PDFs or the only copy of user
data inside `.obsidian/plugins/paper-manager`, because that directory belongs to
the installed plugin and may be removed.

## Packaging constraint

Community plugin releases consist of `main.js`, `manifest.json`, and
`styles.css`. Any EmbedPDF/PDFium WASM and Worker runtime required in production
must therefore be bundled or initialized from content embedded in `main.js`;
do not depend on extra release assets or a remote CDN. Keep Obsidian's UI thread
responsive by running PDF engine work in a Worker when the library supports it.
