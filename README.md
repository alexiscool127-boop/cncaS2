# cncaS2

cncaS2 is a Firefox extension for requesting AI suggestions on Moodle questions. It uses a Cloudflare Worker.

## Use

Hover over a supported question and press Alt+Z. Open the toolbar popup to read the answer and explanation. Hold Shift after Alt+Z to see the answer and explanation. The first hold sends question text to Google in a background tab. The extension uses up to three search excerpts to explain or correct the answer and shows when sources are unavailable. Version 0.9.1 also checks built-in summaries of relevant standards for selected topics. The fixed-size preview starts at 12-pixel text and reduces the size to fit longer answers. Hold Shift and scroll anywhere inside the preview with the wheel or trackpad. Shift plus Up or Down also scrolls longer explanations. Release Shift to close the preview. Repeated questions on the same page can reuse a result from memory. Review suggestions before relying on them.

Version 0.9.7 optionally includes a private index of class slides as a **secondary cross-check in the Shift explanation**, after any matching standards reference and Google results. The model's initial proposed answer does not use the notes. If no relevant note exists, the extension continues without it. Course notes can be incomplete or wrong and do not override external evidence. Relevant snippets (not all notes) are sent to the explanation service when you request an explanation.

Version 0.9.8 collects available Google/standards excerpts and an optional matching note **before** requesting the model's first answer. The pre-answer excerpts are included as clearly labeled, lower-trust context in the question sent to the existing service; no Worker redeploy is required. Notes remain supplemental and never override independent model reasoning or authoritative evidence. If Google is inaccessible, answering still proceeds without search results. This adds a brief wait for the search, and matching reference snippets are sent to the AI service with the question. The Shift explanation can perform a further check.

Version 0.9.9 adds **My study notes** to the toolbar popup. Choose Add notes to import TXT, Markdown, CSV, JSON, PPTX, DOCX, or XLSX files. Import progress reports reading, extracting and saving. Extracted text sections are stored in Firefox's `storage.local` and are searchable alongside any privately bundled notes, without repackaging the extension. Only matching excerpts go to the AI service on an answer/explanation request. Binary images, scans, PDF, and legacy `.ppt` are not decoded in-browser; convert them to a supported format with selectable text first. Notes are supplementary, not an answer database or a guarantee of accuracy.

The toolbar button now has a faint translucent icon and a visually blank tooltip. The installed extension name remains `cncaS2`, as Firefox requires a name. User-imported notes are local to the Firefox profile. **Temporary add-ons loaded through `about:debugging` are removed on browser restart, and removing/reinstalling an add-on can erase its storage.** Use Backup in the popup to download the imported-notes JSON first, then re-import that JSON after reinstalling. The ZIP itself still contains any bundled notes independently of local imports.

Version 0.9.10 accepts ZIP files in the popup. It unpacks an archive in the browser, recursively processes supported Office, PDF and text documents (including nested ZIPs to two levels), reports unsupported or unreadable entries, and indexes matching text into the same local notes store. PDF.js (Mozilla's Apache-2.0-licensed text reader) extracts selectable text from ordinary PDFs. Image-only and scanned pages still require OCR. The importer enforces per-file, entry-count, and total decompression limits to guard against oversized archives. Only extracted text is retained, not the source ZIP or Office files. Cloud sync is not enabled; notes remain on each Firefox profile unless restored from a backup.

Version 0.9.11 collects search snippets with direct background requests, without opening browser tabs. It tries Google first and uses DuckDuckGo's plain-HTML results when Google returns no usable snippets. If neither works, it still answers with available standards references and optional study notes. The former NetAcad launcher was removed so the extension has no tab-opening actions. Search queries are sent to Google and, if necessary, DuckDuckGo when answering or explaining a question.

## Build and test

From the repository root, use Python 3 to package the extension with the HTTPS origin of your deployed Worker.

Run the calculation and Worker response tests with Node.js before deploying:

```sh
node --test *.test.mjs
```

These tests use mocked AI responses. They check validation, error handling and option mapping; they do not measure real-world AI answer accuracy or exercise the Firefox UI.

To check real answer accuracy, create a private JSON file containing questions whose answers you have already verified. Each entry needs `stem`, `choices`, `multiple` and either `expectedPositions` (1-based indices) or `expectedAnswer` for a written response. For example:

```json
[{"stem":"Which option is correct?","choices":["Incorrect example","Correct example"],"multiple":false,"expectedPositions":[2]}]
```

Then run `node accuracy-eval.mjs verified-questions.json https://your-worker.your-subdomain.workers.dev`. This evaluation does not provide an answer database to the extension. It sends up to 10 verified practice questions to your Worker, reports correctness, and counts errors as incorrect. The score only describes those questions, not a guaranteed accuracy rate. Keep questions and results private if they contain personal or course information.

```sh
python package.py https://your-worker.your-subdomain.workers.dev
```

To make a private build containing your own course notes, first extract your lecture files into a `notes-data.js` index and package with `--notes /private/path/notes-data.js`. Only include this file in a ZIP you keep private; do **not** commit the index or the ZIP to a public repository. An ordinary build with no `--notes` still works without notes.

Extract cncaS2.zip to a separate directory. In Firefox, open about:debugging, select This Firefox, then Load Temporary Add-on and choose the extracted manifest.json. Reload the add-on after replacing its files to test an update. The ZIP produced by this script is unsigned.

## Backend

Deploy worker.mjs with the supplied wrangler.jsonc using a Cloudflare account with Workers AI enabled.

```sh
npx wrangler login
npx wrangler deploy
```

The public extension calls /public/answer, /public/diagram and /public/explain. It sends the selected question and its options when requested. The diagram button also sends the chosen image. The Worker rate limit is configured at 12 requests per minute using a shared key. Legacy invite-protected clients can use the separate /answer and /diagram endpoints when the operator configures the BETA_INVITE Worker secret.
