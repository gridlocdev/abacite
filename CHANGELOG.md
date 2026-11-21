# Changelog

## 1.0.0

The first release of Abacite, a calculator that gets decimals right. You type the whole calculation, see the result as you type, and every calculation stays in a session you can come back to. It runs on macOS, Windows and Linux, in the browser and on the command line.

### What's new

- **Exact decimals.** `0.1 + 0.2` is `0.3`. Every result is exact to 34 significant digits, with no floating-point noise, and functions like `sqrt`, `ln` and `sin` are checked against reference values.
- **Type the whole calculation.** The display shows the result as you type, closes any parentheses still open, and says what's wrong with a line that can't be worked out, with the place underlined. A line that starts with an operator continues from `ans`, and `name = expression` keeps a value for later lines.
- **Basic and Scientific keypads.** **⌘1** and **⌘2** switch between them. Scientific adds powers, roots, logarithms, trigonometry in degrees or radians, factorials, π, e, a random number, **2nd** for the inverses, and the memory keys **mc**, **m+**, **m−** and **mr**. Every key types into the same line as the keyboard.
- **A session you keep.** Every calculation goes in the session. **↑** brings a line back, a click inserts its result, and right-click copies or deletes it. **Clear** and every change can be undone.
- **Sessions are plain text files.** Each session is a `.txt` file in a folder you choose, Documents/Abacite by default, named for when you started it and saved as you go. Rename, export and delete them, with a trash to bring deleted ones back. If another app changes the file while you work, Abacite asks which version to keep, and unsaved work is restored after a crash.
- **Unit conversion.** `5 km to mi`, `100 F to C` or `1 GiB -> MB`, with exact factors for length, mass, volume, temperature, time, area, speed and data.
- **Classic entry.** **⌘E** makes the keypad work like a pocket calculator, if you prefer pressing keys one result at a time.
- **Every command from the keyboard.** **⌘K** runs any command by name, and **⌘/** lists every shortcut.
- **A Mac-like window.** On macOS the window has no title bar and a translucent background. The panel button in the status bar shows or hides the session, and the window grows and shrinks to fit it.
- **Light and dark.** Follows the system, or pick one in **Settings** (**⌘,**).
- **The `abacite` command line.** `abacite "2 * (3 + 4)"` prints `14` with the same engine. It also reads lines from stdin or a prompt, and `abacite session <file>` works out a session file and can write the results back.

### Download

- **macOS:** `Abacite-1.0.0-mac-arm64.dmg` for Apple silicon or `Abacite-1.0.0-mac-x64.dmg` for Intel. Drag Abacite to Applications. The build isn't notarized by Apple, so the first time macOS won't open it: choose **Open Anyway** in System Settings → Privacy & Security.
- **Windows:** the installer, `Abacite-1.0.0-win-x64.exe`.
- **Linux:** `Abacite-1.0.0-linux-x86_64.AppImage`. Make it executable and run it: `chmod +x Abacite-1.0.0-linux-x86_64.AppImage && ./Abacite-1.0.0-linux-x86_64.AppImage`.

See [Getting started](https://github.com/gridlocdev/abacite/blob/main/docs/getting-started.md) for running it in the browser, from source and on the command line.
