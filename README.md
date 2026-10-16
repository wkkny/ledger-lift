# Ledger Lift

A desktop app that turns a photo of a handwritten daily sales ledger into editable rows and a CSV. An open-weight vision model reads the page on the shop owner's own computer. Review and correct every row before using it.

The photo is sent only to the local Ollama service on the same computer. Ledger Lift does not store photos or send them to a hosted API. This is an early prototype: handwriting recognition can be wrong, so check each entry against the original page before downloading.

## For the owner

1. Install [Ollama](https://ollama.com/download).
2. Open Ledger Lift. It starts Ollama for you and offers a one-time download of the reading model (about 2 GB).
3. Choose a photo of one ledger page and press **Read this page**. Rows appear as they are found.
4. Fix anything that's wrong, mark each row reviewed, then download the CSV.

Builds are not signed yet. On a Mac, the first time you open the app, right-click it and choose **Open** (on recent macOS, then allow it under **System Settings, Privacy & Security**). On Windows, choose **More info**, then **Run anyway**.

## Develop

Needs Node 22+ and [pnpm](https://pnpm.io). `pnpm install` also downloads the Electron binary.

```sh
pnpm install
pnpm dev                # the real app, with hot reload
pnpm dist               # an installer for this platform, in dist/
```

Checks:

```sh
pnpm typecheck          # main process, preload, and interface
pnpm test               # unit tests, including a fake Ollama server
pnpm test:e2e           # builds, then drives the real app with Playwright against a fake Ollama
```

`pnpm test:e2e` keeps the app's window hidden. To test a packaged build instead of `out/`, set `LEDGER_APP_PATH` to its executable (for example `dist/mac-arm64/Ledger Lift.app/Contents/MacOS/Ledger Lift`).

To run the same end-to-end flow with the real model, which starts Ollama itself and checks it stops on quit, give it a ledger photo and, optionally, the correct rows as a CSV with the header `date,item,quantity,amount`:

```sh
LEDGER_TEST_IMAGE=/path/to/page.jpg LEDGER_TEST_ANSWERS=/path/to/page.csv pnpm test:e2e
```

`pnpm web` opens the interface in a plain browser against a fake backend, so screens can be explored without Electron or Ollama. Add `?scenario=missing-ollama`, `need-model`, `empty` or `error` to the URL to see each state, and `?rowDelay=5000` to slow the rows down. The fake backend is development-only and is not part of builds.

Keep real ledger photos in `samples/private/`; that directory is ignored by Git.

If you start the app or tests from inside another Electron app (some editors and agents), make sure `ELECTRON_RUN_AS_NODE` is not set, or Electron will behave as plain Node and fail to open a window.

## How it works

- `src/renderer` is the Svelte interface, built with [shadcn-svelte](https://shadcn-svelte.com) (the Svelte port of shadcn/ui) on Tailwind v4, and it follows the system light or dark setting. Components live in `src/renderer/src/lib/components/ui`; the theme tokens are at the top of `src/renderer/src/app.css`, so changing `--primary` re-colours everything. Add more with `pnpm dlx shadcn-svelte@latest add <component>`. It shrinks each photo to 1600 px on the long edge before sending it. Full-size phone photos overflow the model's context window and slow it down.
- `src/main` is the app. It starts and stops Ollama, downloads the model with progress, keeps the model loaded between pages, and streams each finished row to the interface. Set `OLLAMA_HOST` if Ollama listens somewhere other than `127.0.0.1:11434`.
- `src/preload` is the only bridge between them. The page is sandboxed with no Node access, and can't navigate away or open windows.
- The default model is `qwen3-vl:2b-instruct`. The plain `qwen3-vl:2b` tag reasons for 30 to 100 seconds before answering, so avoid it. The model can be changed under **Advanced** in the app.

## Current limits

- One JPEG, PNG, or WebP photo at a time.
- Extracts date, item or description, quantity, and amount.
- Each row must be marked reviewed before the CSV download is enabled; unclear fields are highlighted.
- No saved history; the photo is processed in memory and discarded after reading.
- Timing was measured on an Apple M4: about 21 seconds for a 15-row page, with the first row after about 10 seconds. It is untested on computers without a GPU.
- Recognition quality on real ledger handwriting still needs to be checked with a first user. Only a font-rendered test page has been read so far.
- The installer is about 128 MB.

## Why open source

Running an open-weight model locally keeps private shop records off a third-party server and avoids a hosted inference charge for each page. Owners can choose another compatible model, inspect how the extraction prompt works, and keep using the tool without a per-page service subscription.
