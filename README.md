# Ledger Lift

A desktop app that turns a photo of a handwritten daily sales ledger into editable rows and a CSV. An open-weight vision model reads the page on the shop owner's own computer. Review and correct every row before using it.

The photo is sent only to the local Ollama service on the same computer. Ledger Lift does not store photos or send them to a hosted API. This is an early prototype: handwriting recognition can be wrong, so check each entry against the original page before downloading.

## For the owner

1. Install [Ollama](https://ollama.com/download).
2. Open Ledger Lift. It starts Ollama for you and offers a one-time download of the reading model (about 2 GB).
3. Choose a photo of one ledger page and press **Read this page**. Rows appear as they are found.
4. Fix anything that's wrong, mark each row reviewed, then download the CSV.

Builds are not signed yet. On a Mac, the first time you open the app, right-click it and choose **Open**. On Windows, choose **More info**, then **Run anyway**.

## Develop

Needs [Rust](https://rustup.rs), Node 22+, and [pnpm](https://pnpm.io). On macOS, also the Xcode command line tools.

```sh
pnpm install
pnpm tauri dev          # the real app, with the Rust backend and Ollama
pnpm tauri build        # an installer for this platform
```

Checks:

```sh
pnpm check && pnpm test                          # types and interface logic
cd src-tauri && cargo test && cargo clippy       # backend
```

`pnpm dev` opens the interface in a plain browser against a fake backend, so screens can be explored without Ollama. Add `?scenario=missing-ollama`, `need-model`, `empty` or `error` to the URL to see each state, and `?rowDelay=5000` to slow the rows down. The fake backend is development-only and is not part of builds.

A live check of the real extraction path needs Ollama running with the default model:

```sh
LEDGER_TEST_IMAGE=/path/to/page.jpg cargo test --manifest-path src-tauri/Cargo.toml -- --ignored live
```

Keep real ledger photos in `samples/private/`; that directory is ignored by Git.

## How it works

- The interface is Svelte (`src/`). It shrinks each photo to 1600 px on the long edge before sending it. Full-size phone photos overflow the model's context window and slow it down.
- The backend is Rust (`src-tauri/src/`). It starts and stops Ollama, downloads the model with progress, keeps the model loaded between pages, and streams each finished row to the interface.
- The default model is `qwen3-vl:2b-instruct`. The plain `qwen3-vl:2b` tag reasons for 30 to 100 seconds before answering, so avoid it. The model can be changed under **Advanced** in the app.

## Current limits

- One JPEG, PNG, or WebP photo at a time.
- Extracts date, item or description, quantity, and amount.
- Each row must be marked reviewed before the CSV download is enabled; unclear fields are highlighted.
- No saved history; the photo is processed in memory and discarded after reading.
- Timing was measured on an Apple M4: about 24 seconds for a 15-row page, with the first row after about 8 seconds. It is untested on computers without a GPU.
- Recognition quality on real ledger handwriting still needs to be checked with a first user. Only a font-rendered test page has been read so far.

## Why open source

Running an open-weight model locally keeps private shop records off a third-party server and avoids a hosted inference charge for each page. Owners can choose another compatible model, inspect how the extraction prompt works, and keep using the tool without a per-page service subscription.
