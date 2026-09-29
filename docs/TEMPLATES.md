# Template format (`schemaVersion: 1`)

Files use the `.tabletop.json` extension. Validation: [`packages/templates/index.ts`](../packages/templates/index.ts) `validateTemplate` — run in the browser on import/save and again on the server at room creation. Unknown fields are dropped; nothing in a template is executed.

```jsonc
{
  "schemaVersion": 1,
  "id": "garden-table",               // [A-Za-z0-9_-]{1,80}; imports receive a new "custom-…" ID
  "title": "Garden token table", "description": "…", "author": "provenance",
  "profile": "free",                  // free | intrilex-core | intrilex-first-contact (selects a built-in adapter)
  "width": 1200, "height": 800,        // world units, 600–4000 × 400–4000
  "seats": 3,                          // 2–8 (Intrilex profiles: exactly 2)
  "background": "#2f4a2a",
  "zones": [
    { "id": "market", "name": "Market row", "kind": "table", "visibility": "public", "x": 300, "y": 60, "width": 800, "height": 200 },
    { "id": "seeds", "name": "Seed bag", "kind": "pile", "visibility": "hidden", "x": 60, "y": 60, "width": 110, "height": 150 },
    { "id": "hand-0", "name": "Gardener 1 hand", "kind": "hand", "visibility": "owner", "owner": 0, "x": 60, "y": 680, "width": 300, "height": 100 }
  ],
  "cards": [ { "id": "sprout-1", "rank": "Sprout", "suit": "green", "face": "data:image/png;base64,…" } ],
  "decks": [ { "id": "bag", "zone": "seeds", "cards": ["sprout-1"] } ],   // listed bottom → top; every card in exactly one deck
  "objects": [ { "id": "season", "kind": "counter", "text": "Season", "value": 1, "x": 320, "y": 620, "locked": false } ],
  "setup": [ { "op": "shuffle", "zone": "seeds" } ],
  "labels": [ { "text": "Market", "x": 320, "y": 40 } ],
  "seatLayout": [ { "seat": 0, "x": 200, "y": 660 } ],
  "plugins": { "intrilex": { "rulesVersion": "4.3.1", "lessonIds": [] } }   // Intrilex profiles only
}
```

## Zones

| kind | visibility | meaning |
|---|---|---|
| `table` | `public` / `owner` | free placement; face-down cards show backs; `owner` areas are manipulable only by that seat |
| `pile` | `public` / `hidden` / `owner` | ordered stack; public piles show faces; others show counts only |
| `hand` | `owner` (required, one per seat) | private to the owner; others see a count |

## Setup vocabulary (allow-list)

`shuffle {zone}` · `deal {zone, target, count}` · `place {zone, target, count, faceUp}` · `initialize-counter {id, value}` · `choose-first-seat {}` · `deal-seat {zone, seat: "first"|"second", count}`. Any other `op` is rejected.

## Components

`counter` (value), `dice` (`sides` 2–100; changes only by server-random roll), `token`, `note` (≤ 2000 chars), `label`; `locked` components are editable by the host only.

## Card faces

Only embedded `data:image/png|jpeg|webp;base64,…` ≤ 1 MB; bytes must match the declared type (PNG IHDR, JPEG SOI/EOI, WebP RIFF), PNG dimensions ≤ 4096. SVG, URLs, file paths and other schemes are refused. Identical images share one art key, so art never distinguishes two copies of the same face.

## Limits

5 MB file, 216 cards, 64 zones, 128 components, 16 decks, 128 setup steps, 64 labels; text fields reject control characters.

## Templates vs. saved matches

A template holds layout and initial components only. Exports never contain handles, card order, hands, history, invitations or sessions; a live room's *Export template* returns the room's pinned template, not its state. Operator backups (`npm run backup`) are the only way to copy live state.
