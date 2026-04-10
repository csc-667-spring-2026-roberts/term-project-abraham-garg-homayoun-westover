# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Vitest with automated SSE tests (`tests/sse.test.ts`): `text/event-stream` header, long-lived connection with `connected` event, broadcast delivery, and multi-client delivery in the same room.
- Test helper `tests/helpers/sseTestApp.ts` mounting SSE + broadcast routes without database or session.
- `npm run test` and `npm run test:watch` scripts.

### Changed

- ESLint now covers `tests/`; `logging` middleware includes an explicit `void` return type (satisfies `@typescript-eslint/explicit-function-return-type`).
- `tsconfig.json` adds `lib: ["ES2022", "DOM"]` for browser client TypeScript (e.g. `lobby.ts`); production `tsc` includes only `src/`. `tsconfig.eslint.json` extends it with `noEmit` and a repo `rootDir` so ESLint can type-check `tests/` without emitting them.

- `POST /api/broadcast-test` accepts optional JSON body `{ "roomId": "<room>" }` (defaults to `"global"`).
- `POST /api/games` broadcasts `state-update` to both the per-game room and the `global` room so lobby subscribers receive new games.
- Lobby client (`src/client/lobby.ts`): centralized `EventSource` for `roomId=global`, a small `store` helper for DOM updates, deduplicated game rows by `data-game-id`, and reliance on native `EventSource` reconnection (empty `error` listener documents intent). Inline SSE script removed from `views/lobby.ejs`.
