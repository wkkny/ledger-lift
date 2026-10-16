# Ledger Lift

Turn a photo of a handwritten daily sales ledger into editable rows and a CSV, using an open-weight vision model on the shop owner's computer. Review and correct every extracted row before using it.

The image is sent only to the local Ollama service on the same computer. Ledger Lift does not store uploaded photos or send them to a hosted API. This is an early prototype: handwriting recognition can be wrong, so check each entry against the original page before downloading.

## Run locally

1. Install [Ollama](https://ollama.com/download).
2. In a terminal, download the default vision model:

   ```sh
   ollama pull qwen3-vl:2b-instruct
   ```

3. From this directory, start Ledger Lift:

   ```sh
   python3 server.py
   ```

4. Open <http://127.0.0.1:8000>.

The app checks whether Ollama is running and whether the configured model is installed. You can change the model name in the page if you already have another Ollama vision model. The default model can be changed with `OLLAMA_MODEL`, and the web port with `PORT`.

No Python packages or frontend build tools are required. Keep real ledger photos in `samples/private/`; that directory is ignored by Git.

## First user

Try it with a shop owner who already keeps daily sales in a paper book. Ask them to pick one page, compare the extracted rows with the original, and tell you what they would need before trusting a CSV.

## Current limits

- One JPEG, PNG, or WebP photo at a time (up to 12 MB).
- Extracts date, item or description, quantity, and amount.
- Each row must be marked reviewed before the CSV download is enabled; unclear fields are highlighted.
- No saved history; the photo is processed in memory and discarded after extraction.
- Recognition quality on real ledger handwriting still needs to be checked with a first user.

## Why open source

Running an open-weight model locally keeps private shop records off a third-party server and avoids a hosted inference charge for each page. Owners can choose another compatible model, inspect how the extraction prompt works, and keep using the tool without a per-page service subscription.
