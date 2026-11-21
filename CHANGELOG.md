# Changelog

## Unreleased

- A calculator with exact decimal arithmetic (34 digits, 32 shown): type a whole expression and see the result as you type, with parentheses closed for you, `ans`, variables and comments.
- Basic and Scientific keypads, with 2nd functions and degrees or radians.
- A session of every calculation, with ↑/↓ to bring lines back, repeat on Enter, and Clear Session with Undo.
- The command menu (⌘K), the Keyboard Shortcuts window (⌘/), the menu bar, Settings and dark mode.
- The desktop app (Electron) and the browser build, from one code base, with downloads for macOS, Windows and Linux.
- The `abacite` command line: an expression, stdin lines or a prompt, with `--rad`, `--full` and `--json`.
- Memory keys (mc, m+, m−, mr) on the variable `mem`, with M in the display while it is set.
- Unit conversion: `<expr> <unit> to <unit>` with exact factors.
- Classic entry (⌘E): the keypad works like a pocket calculator.
- Session files: each session is a plain text file in a session folder (Documents/Abacite on desktop, the browser's own storage or a folder you pick in the browser), named for the date and time they were made and saved as you go, with Open, New, Rename, Delete with a trash, Export, conflicts when another app changes the file, and recovery of unsaved changes. Undo and redo of session changes, and a menu in each session line.
- `abacite session <file>` works out a session file and can write the results back.
- The desktop app checks for a newer release once a day and says so in the status bar.
- An app icon.
- A native look: the display and the expression line share one screen, softer keys, and on macOS a window with no title bar and a translucent background.
- A panel button in the status bar shows or hides the session. In the desktop app, hiding the session or going back to Basic narrows the window again.
