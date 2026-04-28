# Test Conventions

This project keeps tests outside runtime code in the top-level `test/` directory.

## Structure

- Mirror `src/` domains where practical (for example `test/domain`, `test/services`).
- Keep one test file per unit/module when possible.

## Naming

- Use `*.test.ts` suffix (for example `lock-manager.test.ts`).
- Prefer behavior-focused `describe`/`it` names.

## Imports

- Import code from `src` using relative paths, usually via barrel exports.
- Prefer:
  - `../../src/domain`
  - `../../src/services`
- Avoid importing from `dist` in unit tests.

## Running tests

- Run once: `pnpm test`
- Watch mode: `pnpm run test:watch`

Vitest is configured in `vitest.config.ts` to discover tests under `test/**/*.test.ts`.
