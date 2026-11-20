# Abacite 1.0 slices

Each slice leaves `just check` green and the app working. PRD sections in brackets.

- [x] **1. Skeleton, engine and expression UI.** Workspace, `packages/core` decimal type (§3.1, §3.2), tokenizer, parser and evaluator for every operator, function, constant and percent rule (§4) with `ans` and the engine's support for variables (§5 assignment; memory keys wait for slice 2), CLI single expression, stdin and prompt (§13 without `tape`), `packages/ui` command catalog, ⌘K, Keyboard Shortcuts window, `apps/web` with display, expression line, Basic and Scientific keypads in expression entry (§9.1, §9.2), an in-memory tape with ↑/↓, repeat-on-Enter and leading-operator `ans` (§7.1), Copy Result, theme and dark mode, settings in local storage (§11), Electron shell with headless mode (§12 without updates), Playwright scenarios.
- [x] **2. Variables and memory** (§5, §7.2). Waits on 1.
- [x] **3. Tape files.** Tape format read and write (§8.1), store interface and adapters, tape folder, saving, conflicts, recovery, trash (§8.2, §8.3), undo (§7.3), tape context menu (§7.1), `abacite tape` (§13). Waits on 2.
- [x] **4. Unit conversion** (§6). Waits on 1.
- [x] **5. Classic entry** (§9.3). Waits on 1.
- [x] **6. Release prep.** Icon, README and docs, CHANGELOG, CI and release workflows, update check (§12), accessibility pass (§14). Waits on 1–5.
