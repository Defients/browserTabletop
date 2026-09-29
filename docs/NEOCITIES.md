# Neocities frontend + shared multiplayer server

Prepared September 29, 2026 (America/New_York). Live Neocities upload and a public multiplayer server have not been configured or deployed.

## Prepared target: ttsbrowser.neocities.org

The target-specific upload is `release/ttsbrowser-neocities-upload.zip`; its four files are also unpacked in `release/ttsbrowser-neocities/upload/`. Instructions and per-file hashes sit alongside that folder, outside the upload payload. Upload the folder's contents at `https://ttsbrowser.neocities.org/`, preserving `assets/`.

The public root returned HTTP 200 with title “Learn Jakuv - Interactive Tutorial” on September 29, 2026. Replacing root `index.html` would replace that homepage. Save a copy first, or put Tabletop under `/tabletop/` to preserve the root. No remote files were changed during preparation.

The rebuilt payload passed local Chromium/Firefox checks using the target HTTPS origin and the CSP observed on its public response. Browser routing served the local package bytes; this was not a live deployment test. Both checks covered loading, local draw/reload persistence, lesson/library navigation, missing-server messaging, and zero missing assets/API requests/page errors. Evidence: `artifacts/verification/ttsbrowser-upload-smoke.json`.

The room server remains unconfigured. Do not set its address to the Neocities frontend itself.

## Architecture

Neocities serves the home page, rules, seven lessons, solo First Contact, local free tables, and the template editor. Shared-room links navigate the browser to a separately hosted Tabletop server, which serves the multiplayer UI, API, WebSocket and SQLite-backed state on one origin.

This is top-level navigation, not a cross-origin API connection or iframe. Guest cookies remain first-party. No third-party cookies, CORS proxy, public API credentials, or relaxation of room authorization is required. A configured server URL is a destination, not a claim that the server is reachable.

Neocities is static hosting. Its [official description](https://neocities.org/) and [allowed-file list](https://neocities.org/site_files/allowed_types) support HTML, CSS and JavaScript. The upload contains those file types only. No Node process or SQLite database runs on Neocities. The [Supporter page](https://neocities.org/supporter) lists cross-origin/CSP differences; this architecture does not rely on cross-origin service requests. Sources checked September 29, 2026.

## Build and connect

1. Run `npm ci`, then `npm run build:neocities`.
2. Host the standard production build on a separate HTTPS server with persistent storage, following [OPERATIONS.md](OPERATIONS.md). Set `ORIGIN` to that server's own HTTPS origin and `COOKIE_SECURE=true`. Keep one server instance per SQLite database. Do not set `ORIGIN` to the Neocities URL.
3. Edit **`dist/neocities/site-config.js`**, replacing the empty value with the actual multiplayer origin:

   ```js
   window.TABLETOP_CONFIG = { roomServerUrl: 'https://tables.example.org' };
   ```

   That address is an example, not an existing deployment. Use an HTTPS origin with no path, credentials, query or fragment. HTTP localhost/127.0.0.1 is accepted for local development. Empty or invalid configuration leaves local features usable and shows a clear message when someone opens online rooms.
4. Upload the **contents** of `dist/neocities/` to your Neocities site's root, preserving the `assets/` folder. A subdirectory such as `tabletop/` also works with relative assets and hash routing. Do not upload the source repository, dependencies, server bundles, databases, environment files or a ZIP as the website.
5. Open the HTTPS Neocities page. Test a lesson and local table. Click Create, confirm the address changes to the multiplayer server, create a room, and join its invitation in a separate browser.

You can edit `apps/web/public/site-config.js` before building to keep reusable configuration in source. Every rebuild replaces the generated copy; reapply edits made only in `dist/neocities/`.

Preview with `npm run preview:neocities`, then open `http://127.0.0.1:4173`. Local features need no API server. Online links work once the configured room server is running.

## Saves, templates and invitations

- Local games, lesson progress and custom templates belong to the current browser and origin. Clearing site data removes them. They do not sync between Neocities and the multiplayer site.
- For a custom template: export its `.tabletop.json` file on Neocities, open the multiplayer site's library, import it, and start the room there. Built-in template links select the matching template automatically.
- Shared rooms persist on the separate server. Invitations and recovery codes belong to that server. Generated invitations point directly there.
- A copied `#/join/<token>` or `#/room/<id>` route on Neocities presents a continuation link preserving that route. The static build never calls an API/WebSocket on Neocities.
- Local seat switching is a practice tool; anyone controlling the browser can inspect local state. Private shared play uses the server's role-specific projections.

## Verification

`npm run test:neocities` builds both targets and runs Chromium/Firefox against a plain file server without an API or SPA fallback. It serves a subdirectory and applies `connect-src 'none'`. Tests cover local draw/reload, a state-driven lesson, template editing/export/import, unconfigured online routes with zero service requests, and navigation to a genuine separate backend with selected template, invitation, guest join and saved-room reload.

The strict local CSP is a compatibility test, not a reproduction of every Neocities response header. Account upload, production TLS, proxy/WebSocket configuration and live persistence still require a deployed-host check.
