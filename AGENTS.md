# Abacite — agent guide

Abacite is a calculator with exact decimal arithmetic and a session. One UI runs in the browser and in the Electron app; the `abacite` CLI uses the same engine. There is no NAS server (PRD §2). The spec is [docs/plans/prd.md](docs/plans/prd.md), the slices are in [docs/plans/1-abacite-1.0.md](docs/plans/1-abacite-1.0.md), the code layout is [docs/architecture.md](docs/architecture.md), and the commands are in [docs/development.md](docs/development.md).

## Gates

- `just check` (= `pnpm check`) must pass before you commit: Prettier check, ESLint, `tsc -b`, Vitest (including the architecture rules in `test/architecture.test.ts`), and the build.
- When you change behaviour, add or update a test in the package's `test/` folder, and update the PRD section the code cites (`PRD §n`).
- Every bug fix keeps its reproduction: a unit test, a pinned random-operation seed, or a scenario in `e2e/` for what only shows in the running app. A UI change runs `just e2e`.
- When the owner corrects something, turn the correction into a rule in `test/architecture.test.ts` or a test, not a comment or a line here.
- Never add a `test/architecture-baseline.json`: fix the violation. A comment is never permission: a deliberate exception (`ignoreError(promise, 'why')`, an `eslint-disable`, a `@ts-expect-error`) goes in `test/architecture-exceptions.json` only after the owner agrees.
- Features are named as in [docs/features.md](docs/features.md); every section has a `test.describe` with its name in `e2e/`, and `test/features.test.ts` keeps them in step.
- Reports on UI changes include the screenshots that show the change, and what wasn't checked.
- Check UI changes headlessly: Playwright in the background for the web build, or the desktop app with `--headless`, which runs muted on a throwaway profile and puts no window, menu or dialog on the screen. Never open a visible window or browser to check your work. Any native UI you add (a dialog, a menu, a notification, a prompt) is skipped in headless mode and recorded in `globalThis.abaciteHeadless` for the checks. When a run ends, make sure no Electron process it started is left.

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | The pure engine: the decimal type, functions, formatting, the parser, the evaluator and the session. No DOM or Node (ESLint enforces it). |
| `packages/ui` | Preact and signals: the command catalog, dialogs, ⌘K, settings, the scheduler and the DOM hooks. |
| `apps/web` | The app shell: `AppController`, the keypads, the expression line, the session panel, the list of commands and the Vite entry point. One static build serves the browser and the desktop app. |
| `apps/desktop` | The Electron shell: main process, sandboxed preload bridge, native menu, window state. |
| `apps/cli` | The `abacite` CLI, run from source. It depends on `packages/core` only. |

## Golden rules

1. **The engine stays pure.** It has no UI, DOM or Node APIs, and runs the same in a browser, a worker or Node tests.
2. **Exact arithmetic.** No floating point in a calculation. Every result is rounded once to 34 digits, half to even; functions use guard digits and are checked against reference values.
3. **Errors are values.** The engine returns an error with a position; nothing outside it catches a calculation error.
4. **One command catalog.** The command menu, shortcuts, the Electron menu bar, the Keyboard Shortcuts window and `docs/controls.md` all read it. Don't wire a key or a menu item past it.
5. **Security.** The Electron renderer is sandboxed with context isolation; its only native access is the `abaciteNative` bridge.
6. **Dependencies.** The runtime dependencies are Preact and `@preact/signals`. Don't add a package without the owner's approval. Pin versions exactly.
7. **Nothing left to interpretation.** If a behaviour isn't in the PRD, stop and ask, then record the answer in the PRD.

## TypeScript conventions

- Strict mode with `noUncheckedIndexedAccess` and `erasableSyntaxOnly`: no enums, parameter properties or namespaces. Use union types and `const` objects.
- Relative imports end in `.ts`. Use `import type` for types only.
- Each package's `src/index.ts` names its exports one by one. Other packages import only through `@abacite/<package>`; the architecture test rejects deep imports.
- The file system may be case-insensitive: two files in one folder can't differ only in case (`keyDefs.ts` and `Keypad.tsx`, not `keypad.ts`).

## Git workflow

- Keep commits small and coherent. Write the message as a plain imperative sentence about the user-visible effect.
- Commit only when `just check` is green and no questions are outstanding.
