# Ledger Lift

A desktop app that turns a photo of a handwritten daily sales ledger into editable rows and a CSV. An open-weight vision model reads the page on the shop owner's own computer. Review and correct every row before using it.

The photo is sent only to the local Ollama service on the same computer. Ledger Lift does not store photos or send them to a hosted API. This is an early prototype: handwriting recognition can be wrong, so check each entry against the original page before downloading.

## For the owner

1. Open Ledger Lift. If Ollama isn't installed, the app says so and opens the [Ollama download](https://ollama.com/download) for you. Run its installer (no administrator password needed); the app notices when it finishes and carries on by itself.
2. Ledger Lift starts Ollama for you and offers a one-time download of the reading model (about 2 GB).
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

## Measure how well it reads

`pnpm score` reads your own pages with the real model and compares them to the correct rows you typed in. It reports, per field, how often the model was right, how many rows it missed or invented, and whether the fields it got wrong were the ones it highlighted for review.

1. Make a private folder, such as `samples/private/mine/` (anything under `samples/private/` stays out of Git).
2. For each page, add the photo and an answer file with the same name: `page1.jpg` and `page1.csv`, with the header `date,item,quantity,amount`. A photo without an answer file is read but not scored.
3. Run it (Ollama must be installed; the app starts it):

```sh
LEDGER_SCORE_DIR=samples/private/mine pnpm score
LEDGER_SCORE_MODEL=qwen3-vl:2b pnpm score   # optional: try another installed model
```

Dates match letter for letter, since the model is told not to normalize them. Capitalization, extra spaces, currency symbols and `5.00` vs `5` are forgiven for the headline numbers; the report also shows the strict letter-for-letter score. Details go to `score-report.json` in the same folder.

Don't have handwritten pages yet? `docs/practice/` has a printable ruled page (`ledger-page.html`) and two sets of 15 sales with their answer files. Print the page, copy a set onto it in your own handwriting, photograph it in normal room light, and save the photo next to its `set-1.csv` or `set-2.csv`.

## Release (Windows)

Bump `version` in `package.json`, commit, then push a matching tag:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

The **Windows release** workflow (`.github/workflows/release-windows.yml`) runs the checks on a Windows machine, builds `Ledger-Lift-<version>-setup.exe`, smoke-tests the packaged app, and creates a **draft** GitHub release. Review it and press **Publish**. It also runs on every pull request and by hand from the Actions tab; those runs build the installer but make no release. The installer sets up for the current user only and needs no administrator rights.

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

`pnpm web` opens the interface in a plain browser against a fake backend, so screens can be explored without Electron or Ollama. Add `?scenario=missing-ollama`, `need-model`, `empty` or `error` to the URL to see each state, and `?rowDelay=5000` to slow the rows down. On `missing-ollama`, pressing Download Ollama pretends to install it; `?installTime=<milliseconds>` sets how long that takes. The fake backend is development-only and is not part of builds.

Keep real ledger photos in `samples/private/`; that directory is ignored by Git.

If you start the app or tests from inside another Electron app (some editors and agents), make sure `ELECTRON_RUN_AS_NODE` is not set, or Electron will behave as plain Node and fail to open a window.

## How it works

- `src/renderer` is the React interface, built with [shadcn/ui](https://ui.shadcn.com) components (on Radix) and Tailwind v4, and it follows the system light or dark setting. Components live in `src/renderer/src/components/ui`; the theme tokens are at the top of `src/renderer/src/app.css`, so changing `--primary` re-colours everything. It shrinks each photo to 1600 px on the long edge before sending it. Full-size phone photos overflow the model's context window and slow it down.
- `src/main` is the app. It starts and stops Ollama, downloads the model with progress, keeps the model loaded between pages, and streams each finished row to the interface. Set `OLLAMA_HOST` if Ollama listens somewhere other than `127.0.0.1:11434`.
- `src/preload` is the only bridge between them. The page is sandboxed with no Node access, and can't navigate away or open windows.
- The default model is `qwen3-vl:2b-instruct`. The plain `qwen3-vl:2b` tag reasons for 30 to 100 seconds before answering, so avoid it. The model can be changed from the **Model** picker in the app.

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
