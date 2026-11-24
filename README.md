# cncaS2

cncaS2 is a Firefox extension for requesting AI suggestions on Moodle questions. It uses a Cloudflare Worker. The NetAcad launcher opens Cisco Networking Academy, where the separately installed MeowCad Solver extension can operate.

## Use

Hover over a supported question and press Alt+Z. Open the toolbar popup to read the answer and explanation. Hold Shift after Alt+Z to see the answer and explanation. The first hold sends question text to Google in a background tab. The extension uses up to three search excerpts to explain or correct the answer and shows when sources are unavailable. Version 0.9.1 also checks built-in summaries of relevant standards for selected topics. The fixed-size preview fits the answer and explanation using smaller text. Shift plus Up or Down scrolls longer explanations. Release Shift to close the preview. Repeated questions on the same page can reuse a result from memory. Review suggestions before relying on them.

## Build and test

From the repository root, use Python 3 to package the extension with the HTTPS origin of your deployed Worker.

```sh
python package.py https://your-worker.your-subdomain.workers.dev
```

Extract cncaS2.zip to a separate directory. In Firefox, open about:debugging, select This Firefox, then Load Temporary Add-on and choose the extracted manifest.json. Reload the add-on after replacing its files to test an update. The ZIP produced by this script is unsigned.

## Backend

Deploy worker.mjs with the supplied wrangler.jsonc using a Cloudflare account with Workers AI enabled.

```sh
npx wrangler login
npx wrangler deploy
```

The public extension calls /public/answer, /public/diagram and /public/explain. It sends the selected question and its options when requested. The diagram button also sends the chosen image. The Worker rate limit is configured at 12 requests per minute using a shared key. Legacy invite-protected clients can use the separate /answer and /diagram endpoints when the operator configures the BETA_INVITE Worker secret.
