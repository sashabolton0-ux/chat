# Chat V7

This is the clean V7 baseline.

## Files

- `chat.html` — complete self-contained V7 client (HTML + CSS + JavaScript).
- `launcher.html` — permanent launcher that loads the current `chat.html` from GitHub through jsDelivr.

## GitHub layout

Keep the repository simple:

    chat.html
    launcher.html
    README.md

No old V0/V0.1/V1/V6 files are needed.

## Current test backend

The client is configured for the new test project supplied for V7.

## Version enforcement

The client internally reports version `7`. The server's `min_required_version` should therefore be `7` for the current client to be accepted.

Version numbers are not intentionally displayed to normal users.

## Launcher

The launcher is kept separate from the Chat client. Users keep the launcher; normal Chat updates only require replacing `chat.html` in the GitHub repository.
