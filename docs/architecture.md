# Architecture

Abacite is one TypeScript code base with two hosts and a CLI. The browser and the Electron app run the same UI, and the `abacite` command runs the same engine.

```
     ┌──────────────── apps/web (Preact + signals, one Vite build) ────────────────┐
     │  App · Display · ExpressionLine · Keypad · SessionPanel · Dialogs · StatusBar    │
     │  AppController (settings, line, session, display, dialogs, notices)             │
     │  commands.ts (the catalog) · keyDefs.ts · lineEdit.ts · nativeMenu.ts        │
     └─────────────────────────────────────┬────────────────────────────────────────┘
                                           │ imports
     ┌──────────────────── packages/ui (Preact + signals) ─────────────────────┐
     │  CommandCatalog · listenForKeys · Dialog · ListPopup · focusTrap · Icon   │
     │  settings · schedule · domHooks                                           │
     └─────────────────────────────────────┬───────────────────────────────────┘
                                           │
     ┌──────────────────── packages/core (pure TS) ────────────────────┐
     │  decimal · functions · format · parse · evaluate · session          │◄──── apps/cli, apps/desktop
     └──────────────────────────────────────────────────────────────────┘
```

## Layering

- `packages/core` has no DOM and no Node APIs. ESLint rejects `window`, `document`, `localStorage` and `process` there, so the engine runs the same in a browser, the CLI and the tests.
- `packages/ui` knows the DOM but nothing about calculating.
- Other packages import only through `@abacite/<package>`, and tests only through their own package's `src/index.ts`; the architecture test rejects deep imports.
- `test/architecture.test.ts` also keeps platform APIs in one place each: key listeners in `packages/ui/src/commands/`, timers in `packages/ui/src/schedule.ts`, browser storage in `packages/ui/src/settings.ts`, and effect hooks in the dialog and popup components and `packages/ui/src/components/domHooks.ts`.
- There is no NAS server and, in this version, no file storage: the session lives in memory (PRD §2).

## Core (`packages/core`)

- `decimal.ts`: the number type, a `bigint` coefficient and a base-10 exponent. Every operation rounds to 34 significant digits, half to even; nothing uses floating point (PRD §3.1).
- `functions.ts`: roots, powers, logarithms, trigonometry and factorial, each computed with guard digits and rounded once (PRD §4.4, §4.5).
- `format.ts`: a decimal as text, to 32 digits by default, with optional comma grouping (PRD §3.2).
- `names.ts`: the reserved function and constant names, kept apart from their meanings.
- `parse.ts`: the tokenizer and a Pratt parser for one line: precedence, implicit multiplication, postfix `!` and `%`, assignment, comments, and the parentheses the end of the line closes (PRD §4.1).
- `evaluate.ts`: evaluates a parsed line against a scope of variables and `ans`. Errors come back as values with a position and whether the line is merely unfinished (PRD §4.6).
- `session.ts`: the session as an immutable list of lines with their results; a leading operator continues from `ans`, Enter on an empty line repeats the last operation, and `rand()` values are recorded so a session evaluates the same way twice (PRD §7).

## UI (`packages/ui`)

- `commands/`: the `CommandCatalog`. Shortcuts are parsed once; `listenForKeys` is the one key listener.
- `settings.ts`: the per-device settings and where they are kept (PRD §11).
- `components/`: `Dialog` (focus trap, Escape, one at a time), `ListPopup` for ⌘K, `Icon`, and `domHooks.ts`, which keeps the expression field, focus and the session's scroll position in step with the model.
- `schedule.ts`: the page's only timers.

## App (`apps/web`)

- `controller.ts`: `AppController` holds the app's state as signals: settings, the expression line (text and selection), the session, what the display shows, the open dialog and the notice. Every key, keypad button and command calls one of its methods.
- `lineEdit.ts`: pure edits of the expression line: insert, wrap a function around the selection, delete a whole `sin(` at once, change sign, clean pasted text.
- `keyDefs.ts`: the Basic and Scientific keypads as data, with each key's name, action and 2nd variant.
- `commands.ts`: every command, its shortcut and when it's enabled; `nativeMenu.ts` builds the menu bar from it and `shortcuts.ts` the Keyboard Shortcuts window. `docs/controls.md` is checked against it by `apps/web/test/controls.test.ts`.
- `native.ts`: the `abaciteNative` bridge when the page runs in the desktop app.

## Desktop (`apps/desktop`)

The Electron main process loads the built web client from `app://abacite/` in a sandboxed renderer with context isolation. It serves no other app:// host, keeps every frame on those pages, and grants the page one permission, writing to the clipboard. The preload script exposes `abaciteNative`: the version, the menu bar, menu commands and a request to resize the window when the Scientific keypad or the session is shown or hidden. The main process keeps the window's place and size (`windowState.ts`, saved atomically). For automated checks, `--headless` (or `ABACITE_HEADLESS=1`) renders offscreen and muted, with no window or Dock icon, on a fresh profile in the system's temporary folder unless `ABACITE_USER_DATA` names one. It puts nothing on the screen: the right-click menu and links to open are recorded in `globalThis.abaciteHeadless` instead, and an uncaught exception or unhandled promise rejection in the main process is written to stderr and exits the app with code 1 rather than showing Electron's error dialog. `headlessStart.ts` sets this up as the first import of `main.ts`, before any other module runs.

## CLI (`apps/cli`)

`abacite` runs from source with Node's type stripping and depends on `packages/core` only. `runCli` takes its streams and stdin as arguments, so the tests drive it without a process (PRD §13).

## Tests

- Unit tests sit in each package's `test/` folder and run with Vitest. `packages/core/test/reference.ts` holds function values from an independent high-precision source; `randomArithmetic.test.ts` checks random sums, products, quotients and remainders against exact fractions.
- `test/architecture.test.ts` checks the layering rules, and `test/features.test.ts` checks that every section of `docs/features.md` has a scenario.
- `e2e/` holds Playwright scenarios against the built web client and a headless desktop smoke test.
