# Notices, dependencies and provenance

## Platform code

The Tabletop platform code in this repository (apps/, packages/tabletop, packages/templates, packages/protocol, tests/, e2e/, docs/) was written for this project. **No licence has been chosen or applied yet**; distribution terms are for the project owner (Deffy) to decide. The repository is private and not published.

## Intrilex material — separate rights

- *Intrilex — Complete Player Rulebook v4.3.1* (`sources/`) and the Intrilex game design, names and terminology belong to their owner and were supplied by Deffy. They are **not** covered by any platform licence decision.
- `packages/intrilex` implements those rules. Rule summaries in `packages/intrilex/rules.ts`, lesson text and the in-app reference are original paraphrases keyed to rulebook headings, not copies of rulebook text.
- No code, assets or architecture were copied from the earlier Intrilex application; it is not a runtime dependency.
- Unresolved: permission to distribute the Intrilex implementation and rulebook outside private use.

## Visual assets

All visuals are CSS and Unicode suit/star glyphs rendered with system fonts. No third-party images, icon sets or web fonts are bundled. User-supplied card faces in templates remain the property of whoever supplies them.

## Runtime dependencies (shipped)

| Package | Version | Licence |
|---|---|---|
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| ws | 8.22.0 | MIT |
| Node.js (runtime, incl. `node:sqlite`) | 24.21.0 | MIT and bundled third-party licences |

## Development and build dependencies (not shipped)

| Package | Version | Licence |
|---|---|---|
| @axe-core/playwright | 4.13.0 | MPL-2.0 |
| @playwright/test | 1.63.0 | Apache-2.0 |
| typescript | 6.0.3 | Apache-2.0 |
| vite, @vitejs/plugin-react | 8.3.1, 6.1.1 | MIT |
| tailwindcss, @tailwindcss/vite | 4.3.3 | MIT |
| esbuild | 0.28.2 | MIT |
| eslint, @eslint/js, typescript-eslint | 10.11.0, 10.0.1, 8.70.1 | MIT |
| tsx | 4.23.15 | MIT |
| concurrently | 10.0.5 | MIT |
| node (project-local runtime package) | 24.21.0 | MIT |
| @types/node, @types/react, @types/react-dom, @types/ws | — | MIT |

Transitive dependencies are pinned in `package-lock.json`; `npm ci` reported 0 known vulnerabilities on 2026-09-27.
