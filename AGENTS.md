# Paper Manager development notes

## Product boundary

Paper Manager is an Obsidian-native academic paper library. Paper import,
organization, reading, and annotation are free/local features. Single-paper AI
analysis and `@pp` questions are paid features. Cross-paper synthesis and
presentation generation are planned rather than part of the current MVP.

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

Add an `Edit in Paper Manager` action to Obsidian's native PDF view and Markdown
embeds only for verified managed `source.pdf` or `annotated.pdf` files. A sibling
`index.md` with `paper_manager: true` must resolve back to the immutable source;
folder location or filename alone is not sufficient. The action opens the
dedicated reader/editor with the paper ID and paths, rather than modifying the
native PDF viewer DOM.

## Data access

Discover papers by scanning `<library-folder>/**/index.md` with the Vault API and
reading frontmatter from `MetadataCache`. Use `FileManager.processFrontMatter`
for metadata updates. Keep a runtime React/store index for table search, sorting,
and filtering rather than repeatedly reparsing every note during render.

While the library view is mounted, listen for Vault create, modify, rename, and
delete events inside the configured library folder. Debounce a full repository
refresh so bursts of related writes do not cause repeated scans. Unsubscribe
when the view/repository is disposed, and ignore changes outside the library.

Use the Vault API for visible Vault files, including `createBinary`,
`readBinary`, and `modifyBinary`. Do not store user PDFs or the only copy of user
data inside `.obsidian/plugins/paper-manager`, because that directory belongs to
the installed plugin and may be removed.

Deleting a managed paper is a confirmed destructive action. Delete its complete
UUID folder through `FileManager.trashFile()` so the immutable source PDF,
index note, derived annotated PDF, and annotation state all follow the user's
configured Obsidian deletion behavior. Do not maintain a second Paper Manager
trash folder.

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

Use the Vercel AI SDK for the analysis transport and source-owned AI Elements
components for analysis progress. The Worker exposes a generic `/api/chat`
route rather than a paper-analysis-specific endpoint. Keep one Worker base URL
as a source constant, use it for both billing and chat, and pass the paper
schema, prompts, messages, and tools through the generic chat request. Read the
Paper Manager billing key from plugin settings. The key is stored in Obsidian's
plugin settings data and is not encrypted; never write it into a paper note or
include it in logs.

The paid product type is `paper_manager`, and its allowed chat model is
`openai/gpt-5.6-luna`. The Worker remains a generic authenticated model proxy;
Paper Manager owns the analysis system prompt, paper context, output schema,
and validation rules.

The production Worker base URL is `https://editable.artifact-kit.com`. Keep all
network use user-initiated and disclosed in the README and settings. The client
must not include analytics or telemetry. The service privacy policy lives at
`https://editable.artifact-kit.com/privacy`.

Before starting an AI document request, generate one request ID and call the
billing Worker's `/api/usage/start` endpoint with the key, request ID, and
`paper_manager` product type. Keep the same request ID if that billing call is
retried so a network retry cannot become a second logical charge. Validate the
response and pass its usage token to the AI endpoint in the `x-usage-token`
header. Keep usage tokens in memory only and never persist or log them.

The settings tab may call the read-only `/api/keys/validate` endpoint with the
billing key and `paper_manager` product type to display `remainingCredits`.
Validation and balance refreshes must never call `/api/usage/start` or consume a
credit. Refresh when settings open, after a changed key loses focus, and on an
explicit Refresh action. Validate the response shape, handle stale concurrent
requests, and never log or display the complete key.

AI analysis and `@pp` support PDFs with at most 30 pages. Count pages locally
and reject larger PDFs before starting billable usage or constructing/uploading
the PDF data URL. Larger PDFs must remain fully usable for free local import,
organization, reading, and annotation.

AI jobs update `ai_status`, `ai_schema_version`, `ai_model`, `ai_updated_at`, and
`ai_error` in `index.md`. Validate the structured response before applying all
result fields through the repository's single frontmatter update operation.
Analyze the immutable `source.pdf`, send it as an `application/pdf` file part,
and force one `savePaperAnalysis` client-tool call. Validate the tool input with
Zod before writing any extracted fields. Use Obsidian's `requestUrl` through a
Fetch-compatible adapter so calls do not depend on renderer CORS permissions;
the adapter buffers the HTTP response before the AI SDK decodes its UI-message
stream, so this workflow should be presented as staged progress rather than
token-by-token streaming.

## Packaging constraint

Community plugin releases consist of `main.js`, `manifest.json`, and
`styles.css`. Any EmbedPDF/PDFium WASM and Worker runtime required in production
must therefore be bundled or initialized from content embedded in `main.js`;
do not depend on extra release assets or a remote CDN. Keep Obsidian's UI thread
responsive by running PDF engine work in a Worker when the library supports it.

Keep `react` and `react-dom` pinned to `18.3.1`. React DOM 19's production
runtime includes three dynamic `<script>` element creation paths for resource
hoisting even when Paper Manager never renders a script. The Obsidian Community
scanner rejects those paths. Do not upgrade React unless a production `main.js`
build is proven to contain zero dynamic script element creations.

Keep every direct `@embedpdf/*` dependency pinned to the same exact validated
version, currently `2.14.4`. Do not use caret ranges or mix EmbedPDF minor
versions: packages share enum and plugin identities, and a partially upgraded
tree can cause type errors or runtime incompatibilities.

## Community release checklist

Before tagging a release:

1. Run `npm ci`, `npm run lint`, and `npm run build` from a clean dependency
   install.
2. Scan the actual production `main.js`, not only TypeScript sources. It must
   contain zero `createElement("script")`, `createElement('script')`, or
   equivalent `createElementNS` calls. Do not obfuscate strings to bypass the
   scanner; remove the dependency or code path that provides the capability.
3. Keep `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`
   on the same `x.y.z` version, then create a tag with that exact version and no
   `v` prefix.
4. Confirm the GitHub release contains exactly `main.js`, `manifest.json`, and
   `styles.css`, and that the uploaded manifest matches the tag.
5. Verify the CI-uploaded `main.js` again for dynamic script creation before
   publishing the release and resubmitting Community review.
