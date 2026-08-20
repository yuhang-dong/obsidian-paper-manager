# Paper Manager

Paper Manager turns an Obsidian vault into a local library for importing,
reading, annotating, and analyzing academic papers.

Your papers and annotations stay as ordinary files in your vault. The core
library works without an account, payment, or internet connection. Optional AI
actions are paid and send the selected paper to an external processing service;
see [Paid AI features](#paid-ai-features) and
[Privacy and data handling](#privacy-and-data-handling) before using them.

## Features

- Import one or more PDFs into stable, plugin-managed paper folders.
- Detect duplicate imports by the PDF's SHA-256 hash.
- Search by title and filter by reading status, author, keyword, or year.
- Edit a paper's title, authors, keywords, and reading status from the library.
- Read, highlight, draw, and add comments in a dedicated PDF workspace.
- Store editable annotations separately and generate an `annotated.pdf` copy.
- Analyze a single paper with AI and save structured metadata and an overview to
  its index note.
- Ask an AI assistant about a paper by starting a PDF comment with `@pp`.
- Refresh the library automatically when files in its configured folder change.

Multi-paper synthesis, bulk selection, and presentation generation are not part
of the current release.

## Requirements

- Obsidian 1.8.7 or later.
- A billing key and internet connection only if you use the optional AI
  features.

PDFs over 30 pages can be imported, organized, read, and annotated locally, but
**Analyze**, **Reanalyze**, and `@pp` will reject them before billing or sending
document content to the AI service.

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community plugins** in Obsidian.
2. Turn off Restricted mode if Obsidian asks you to do so.
3. Select **Browse**, search for **Paper Manager**, and select **Install**.
4. Select **Enable** after installation.

### Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the latest
[GitHub release](https://github.com/yuhang-dong/obsidian-paper-manager/releases),
then place them in:

```text
<vault>/.obsidian/plugins/paper-manager/
```

Reload Obsidian and enable **Paper Manager** under **Community plugins**.

## Getting started

1. Open **Settings → Paper Manager** and choose the vault-relative paper
   library folder. The default is `Papers`.
2. Open the library from the ribbon icon or run **Paper Manager: Open paper
   library** from the command palette.
3. Select **Import PDF** and choose one or more PDF files.
4. Select a paper title to open its index note. Open its managed PDF and choose
   **Edit in Paper Manager** to annotate it.
5. Optionally add a billing key in settings, then select **Analyze** in the
   library or write `@pp your question` in a PDF comment.

Only PDFs imported and verified as Paper Manager papers show the **Edit in Paper
Manager** entry point. Moving an arbitrary PDF into the library folder does not
make it a managed paper.

## Vault data

Each imported paper is stored in a UUID-named folder under the configured
library folder:

```text
Papers/
  <paper-id>/
    index.md
    source.pdf
    annotated.pdf
    annotations.json
```

- `index.md` contains the paper's metadata, AI-generated overview, and your
  notes. The `paper_manager: true` property identifies a managed paper.
- `source.pdf` is the immutable imported PDF used for reading and local text
  extraction for AI requests.
- `annotations.json` is the editable annotation source of truth.
- `annotated.pdf` is a generated PDF with saved annotations applied.

Paper Manager reads and writes only its configured folder inside the vault and
its own Obsidian plugin settings data. It does not access files outside the
vault. Deleting a paper from the library sends its entire managed folder to the
trash method configured in Obsidian.

## Paid AI features

Local importing, organization, reading, and annotation do not require payment.
The following actions require a Paper Manager billing key and consume credits:

- Each **Analyze** or **Reanalyze** request.
- Each new `@pp` question answered in a PDF comment.

A billing key is a credential for the external service at
[editable.artifact-kit.com](https://editable.artifact-kit.com/). Paper Manager
does not provide a separate account-creation flow inside Obsidian, and the key
is not required for local features.

Email [dong_yu_hang@126.com](mailto:dong_yu_hang@126.com) to request a free
trial key.

Credits are reserved or charged when an AI request starts, before generation
finishes. The successful-result notice displays the amount charged and the
remaining balance reported by the service. If a request fails after billing has
started, it may already have consumed credits.

## Privacy and data handling

Paper Manager does not contain client-side analytics, telemetry, advertising,
or background network requests. Local library features remain inside your
vault.

When—and only when—you explicitly select **Analyze**/**Reanalyze** or submit an
`@pp` question, the plugin connects to
[`https://editable.artifact-kit.com`](https://editable.artifact-kit.com/) to:

1. Start billable usage by sending the billing key, a random request ID, and the
   `paper_manager` product identifier.
2. Extract the PDF text locally and send that text with explicit page markers
   plus the request data for AI processing. Analyze, Reanalyze, and `@pp` do not
   upload the PDF file itself.

For analysis, request data includes the imported filename, current library
title, locally extracted page-by-page text, analysis instructions, and the
expected output schema. For `@pp`, it includes the locally extracted page-by-page
text, question, up to the ten most recent question-and-answer turns in that
comment thread, and text selected near the comment when available. The service
returns the AI result and billing information such as credits charged and
remaining credits.

The billing key is saved unencrypted in Obsidian's plugin settings data. It is
not written into paper notes or annotation files. Treat the key as a secret and
do not share your Obsidian configuration directory.

Server-side processing, retention, operational logging, subprocessors, and
privacy-request contact details are described in the
[Editable Artifact Privacy Policy](https://editable.artifact-kit.com/privacy).
Do not use AI features with confidential, sensitive, or third-party documents
that you are not permitted to send to an external AI processing service.

## Support and feedback

Report bugs and request features in
[GitHub Issues](https://github.com/yuhang-dong/obsidian-paper-manager/issues).
Please do not include billing keys, private PDFs, or other sensitive data in an
issue.

## Development

Requires Node.js 20 or later.

```bash
npm install
npm run build
```

Use `npm run dev` for watch mode. To deploy to a local development vault, copy
`local.config.example.json` to `local.config.json`, set its absolute `vaultPath`,
and run:

```bash
npm run build:obsidian
```

This also creates `.hotreload` in the deployed plugin directory. Install and
enable Obsidian's Hot Reload plugin to reload Paper Manager after subsequent
local deployments.

For continuous local builds with the Obsidian
[Hot Reload](https://github.com/pjeby/hot-reload) plugin, run:

```bash
npm run dev:obsidian
```

You can override the configured vault for one invocation with the
`OBSIDIAN_VAULT_PATH` environment variable.

## License

Paper Manager is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). Personal, educational,
charitable, and other noncommercial uses are permitted under its terms.
Commercial use requires a separate license from the copyright holder; contact
the author through the project repository to discuss commercial licensing.

Third-party dependencies remain subject to their respective licenses and
notices.
