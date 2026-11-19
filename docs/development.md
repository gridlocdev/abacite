# Development

Abacite is a TypeScript pnpm workspace. One Preact build runs in the browser and inside the Electron app; the CLI uses the same engine. [Architecture](architecture.md) explains the layout, and the [product requirements](plans/prd.md) say exactly how everything behaves.

## Getting set up

You need Node 22.18 or later, pnpm (through corepack) and [just](https://github.com/casey/just). Run `just` on its own to list every recipe.

```bash
just setup   # corepack enable, then pnpm install
```

### Running it

| Recipe | What it runs |
| --- | --- |
| `just run-web` | The web client on http://localhost:5173 with hot reload |
| `just preview-web` | The built web client as a static site |
| `just run-desktop` | The desktop app (builds the web client first) |
| `just run-desktop-headless` | The desktop app with `--headless`: no window, Dock icon, sound or dialog, on `./.headless-data`, with DevTools on port 9338 (for automated checks) |
| `just cli <args>` | The `abacite` CLI from source, for example `just cli "2^0.5"` |

To try the desktop app on a throwaway profile, set `ABACITE_USER_DATA` to another folder:

```bash
ABACITE_USER_DATA=/tmp/abacite-try just run-desktop
```

## Checking your work

```bash
just check        # everything CI runs: format, lint, typecheck, tests, build
just test         # the tests once (pass a file or -t "name" to narrow them)
just test-watch   # the tests in watch mode
just check-arch   # the architecture rules only
just fuzz         # random arithmetic on 500 seeds (FUZZ_SEED=<n> repeats one)
just e2e          # browser scenarios against the built web client
just e2e-desktop  # the desktop app, headless, on a throwaway profile
```

`just check` must pass before every commit. The browser scenarios run on port 8798.
