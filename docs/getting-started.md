# Getting started

Abacite runs as a desktop app on macOS, Windows and Linux, in a modern browser, and as the `abacite` command line.

## Download

Download the desktop app from [Releases](https://github.com/gridlocdev/abacite/releases): a `.dmg` or `.zip` for macOS (Apple silicon or Intel), an `.exe` installer for Windows, or an AppImage for Linux.

Drag Abacite to Applications. The macOS app isn't notarized by Apple, so the first time macOS won't open it: open System Settings → Privacy & Security and choose **Open Anyway** next to the message about Abacite. After that it opens normally.

## Run from source

You need Node 22.18 or later, pnpm (through corepack) and [just](https://github.com/casey/just).

```bash
just setup         # install the dependencies
just run-desktop   # the desktop app
just run-web       # the browser version on http://localhost:5173
```

## The command line

The `abacite` command uses the same engine. From the source folder, run it through just:

```bash
just cli "2 * (3 + 4)"
```

With no expression it reads one calculation per line from stdin, or shows a `> ` prompt in a terminal. [Features](features.md#command-line) lists its options.

## The first start

The desktop app asks where to keep your sessions: **Use Documents/Abacite**, or **Choose Folder…** for another folder. **⌘O** (**Ctrl+O**) picks another folder later.

The browser keeps sessions in its own storage, and the status bar says "Stored in this browser". In Chrome and Edge, **Open Session Folder…** in the command menu (**⌘K**) keeps them in a folder on disk instead.

## Where your data lives

- **Sessions:** one plain text file per session, `*.txt`, in the session folder. Other apps can read and change them.
- **Trash:** deleted sessions go to `.abacite/trash/` inside the session folder, until you restore them with **Open Trash…**.
- **Settings:** kept by the app on this device (in the browser, per site). Unsaved work is kept there too, to restore after a crash.
