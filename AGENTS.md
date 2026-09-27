# Browser Tabletop

Independent greenfield project. `sources/BROWSER_TABLETOP_MASTER_PROMPT.md` is the complete contract; supplied v4.3.1 rulebook is canonical. No runtime dependency on old Intrilex. No publication or public deployment.

Preserve privacy on the server: only projected views leave it, host is not omniscient, no future deck order or stable hidden card IDs. Durable commands persist before acknowledgement, request IDs are idempotent, revisions reject stale mutations. Guided rules state is authoritative; table projection is derived. Imported templates are data only. Do not weaken tests or rules to report success.

Ownership: lead owns packages/tabletop, packages/templates, tooling and release integration. Authority Shard owns apps/server and tests/server*. Rules Shard owns packages/intrilex, tests/intrilex*, source map and capability matrix. Interaction Shard owns apps/web and browser interaction tests. Coordinate interface changes through docs/INTERFACES.md and messages. Verification Shard follows after one slot frees.

Use npm. Commands planned: npm run dev, npm run lint, npm run typecheck, npm test, npm run test:e2e, npm run build, npm start. Record actual results in STATUS.md. All code TypeScript; immutable validation/application where practical. Read full canonical source before claiming full rules coverage.
