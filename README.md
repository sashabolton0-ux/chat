# Chat V7

## GitHub Pages launcher

This version is intended to be served by GitHub Pages over HTTPS.

Repository files:
- `chat.html`
- `launcher.html`
- `README.md`

The launcher fetches the V7 client from the pinned jsDelivr commit:

`c9601badab587bc7bcb3e5c4ecc29ae890b4b302`

It verifies that the fetched client contains:
- the V7 client version
- the current V7 test project

Then it writes the client into a new `about:blank` window.

### GitHub Pages

In GitHub:
Settings -> Pages -> Build and deployment -> Deploy from a branch
Branch: `main`
Folder: `/ (root)`

Open the launcher from the HTTPS GitHub Pages URL, not as a downloaded `file://` file.
