# Changelog

## Unreleased

- A calculator with exact decimal arithmetic (34 digits, 32 shown): type a whole expression and see the result as you type, with parentheses closed for you, `ans`, variables and comments.
- Basic and Scientific keypads, with 2nd functions and degrees or radians.
- A tape of every calculation, with ↑/↓ to bring lines back, repeat on Enter, and Clear Tape with Undo.
- The command menu (⌘K), the Keyboard Shortcuts window (⌘/), the menu bar, Settings and dark mode.
- The desktop app (Electron) and the browser build, from one code base.
- The `abacite` command line: an expression, stdin lines or a prompt, with `--rad`, `--full` and `--json`.
- Memory keys (mc, m+, m−, mr) on the variable `mem`, with M in the display while it is set.
- Unit conversion: `<expr> <unit> to <unit>` with exact factors.
- Classic entry (⌘E): the keypad works like a pocket calculator.
- Tape files: each tape is a plain text file in a tape folder (Documents/Abacite on desktop, the browser's own storage or a folder you pick in the browser), saved as you go, with Open, New, Rename, Delete with a trash, Export, conflicts when another app changes the file, and recovery of unsaved changes. Undo and redo of tape changes, and a menu on each tape line.
- `abacite tape <file>` works out a tape file and can write the results back.
- The desktop app checks for a newer release once a day and says so in the status bar.
- An app icon.
