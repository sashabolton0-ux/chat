# Chat V7 — one-time launcher

## What this setup does

Users download `launcher.html` ONCE.

They double-click it, and it immediately opens the current hosted Chat.
There is:
- no Launch button
- no about:blank
- no popup
- no second Chat download
- no jsDelivr dependency for the main HTML

The launcher always points to:

https://sashabolton0-ux.github.io/chat/chat.html

The `?open=TIMESTAMP` query helps avoid the browser reusing an old cached copy.

## GitHub repository

Keep these files in the repository:

- `chat.html` — the actual V7 Chat application
- `launcher.html` — the one-time downloaded launcher
- `README.md` — instructions

## GitHub Pages

GitHub Pages should publish from the repository's `main` branch and the root folder.

GitHub Pages project-site URLs use this pattern:

https://OWNER.github.io/REPOSITORY/

For this repository:

https://sashabolton0-ux.github.io/chat/

Users do NOT need to visit that address manually. The launcher sends them there automatically.

## Updating Chat later

When `chat.html` is changed:
1. Replace/commit the new `chat.html` in GitHub.
2. GitHub Pages republishes the repository.
3. Existing launchers keep pointing to the same URL.
4. Users do not download a new launcher.

GitHub says branch-based Pages sites republish when changes are pushed to the selected publishing source.
