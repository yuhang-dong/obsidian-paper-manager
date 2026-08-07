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
└── annotations.json
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
- `index.md` properties are the canonical paper metadata and AI-analysis record.
  Keep annotations separate because they contain PDF geometry and viewer state.

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

## Paper property schema

`index.md` frontmatter is the single source of truth for bibliographic metadata
and AI-generated analysis. The property schema defines stable field IDs,
frontmatter keys, Obsidian property types, and Paper Manager table editors.

Use Obsidian-compatible property types: text, list, number, checkbox, date, and
datetime. Literature type is stored as text but rendered by Paper Manager as a
controlled select. Authors and keywords are lists; publication year is a
number. Long-form analysis remains a text property and is edited through Paper
Manager's multiline editor. Checkbox fields are intended for boolean user state
such as verification or favorites, not for long-form AI output.

## AI integration

Use the Vercel AI SDK and AI Elements when the real analysis UI and streaming
workflow are implemented. The Worker exposes a generic `/api/chat` route rather
than a paper-analysis-specific endpoint. Keep one Worker base URL as a source
constant, use it for both billing and chat, and pass the paper schema, prompts,
messages, and optional tools through the generic chat request. Read the Paper
Manager billing key from plugin settings. The key is stored in Obsidian's plugin
settings data and is not encrypted; never write it into a paper note or include
it in logs.

The paid product type is `paper_manager`, and its allowed chat model is
`openai/gpt-5.6-luna`. The Worker remains a generic authenticated model proxy;
Paper Manager owns the analysis system prompt, paper context, output schema,
and validation rules.

Before starting an AI document request, generate one request ID and call the
billing Worker's `/api/usage/start` endpoint with the key, request ID, and
`paper_manager` product type. Keep the same request ID if that billing call is
retried so a network retry cannot become a second logical charge. Validate the
response and pass its usage token to the AI endpoint in the `x-usage-token`
header. Keep usage tokens in memory only and never persist or log them.

AI jobs update `ai_status`, `ai_schema_version`, `ai_model`, `ai_updated_at`, and
`ai_error` in `index.md`. Validate the structured response before applying all
result fields through the repository's single frontmatter update operation.

## Packaging constraint

Community plugin releases consist of `main.js`, `manifest.json`, and
`styles.css`. Any EmbedPDF/PDFium WASM and Worker runtime required in production
must therefore be bundled or initialized from content embedded in `main.js`;
do not depend on extra release assets or a remote CDN. Keep Obsidian's UI thread
responsive by running PDF engine work in a Worker when the library supports it.
