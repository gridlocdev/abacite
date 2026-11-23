# Features

Abacite is a calculator with exact decimal arithmetic. You type a whole expression, see its result as you type, and keep every calculation in a session. [Controls](controls.md) lists the keys.

## Expression line

Type a whole calculation, such as `2 * (3 + 4)` or `sqrt(2) / 2`, and the display shows the result as you type. The end of the line closes any parentheses still open, shown greyed after what you typed. A line that isn't finished yet (`2 +`) leaves the last result greyed instead of showing an error, and a line that's wrong says why, with the place underlined. **Enter** puts the line in the session. A line that starts with an operator (`* 3`) continues from the last result, shown as a greyed `ans`, and **Enter** on an empty line repeats the last operation (`+ 3` again). `name = expression` keeps a value in a variable for later lines, and `#` starts a comment. **Esc** clears the line, then the last result.

## Exact decimals

Every number is a decimal, computed to 34 significant digits and shown to 32, so `0.1 + 0.2` is `0.3` and money adds up to the cent. Large results are grouped with commas (`1,234,567`), which Settings can turn off; Copy Result (**⇧⌘C**) always copies the number without commas. `+ 10%` adds 10% of the number before it.

## Keypads

The Basic keypad has digits, the four operations, parentheses, percent and change sign; **⌘2** adds the Scientific keypad beside it with memory keys, powers, roots, logarithms, trigonometry, hyperbolic functions, π, e, factorial and a random number. **2nd** switches some keys to their inverses (arcsine, 2ˣ, log₂). Every key types into the expression line, so the keyboard and the keys mix freely. The angle key, or **⇧⌘R**, switches trigonometry between degrees and radians. In the desktop app the window grows to make room for the Scientific keypad or the session, and shrinks back when you hide them. **⌘1** goes back to Basic.

## Memory

The Scientific keypad has the memory keys. **m+** adds the result to memory and **m−** subtracts it (a calculation still being typed goes in the session first), **mc** clears memory, and **mr** inserts it into the expression line. Memory is the variable `mem`, so each key puts an ordinary line in the session (`mem = mem + 15`) and you can type `mem` too. The display shows **M** while memory isn't 0.

## Unit conversion

Type a value with a unit, then `to` or `in` and another unit: `5 km to mi`, `100 F to C`, `(3+2) kg in lb`, `1 GiB -> MB`. Abacite converts length, mass, volume, temperature, time, area, speed and data with exact factors, so `1 in to cm` is exactly 2.54. The result shows its unit in the display, in the session and in the command line, while **⇧⌘C** copies the number alone and the next line's `ans` is the number. Unit names are case-sensitive (`MB` is a megabyte, `mB` is nothing), and units of different kinds give an error.

## Classic entry

**⌘E** (or **Entry** in Settings) makes the keypad work like a pocket calculator. The expression line goes away and the display shows the number you're entering, with the calculation so far in small text above it. Operators apply as you press them, with normal precedence: `2 + 3 × 4 =` is 14. Function keys work on the number shown at once (`9 √` is 3). After + or −, **%** shows the amount it adds or takes away: `200 + 10 %` shows 20, and **=** gives 220. **=** puts the whole calculation in the session as an expression (`2 + 3 * 4`), and pressing it again repeats the last operation. The keyboard drives the same keys: digits, `+ - * / ^ % ( )`, Enter, Backspace and Esc.

## Session

**⌘T**, or the panel button at the right of the status bar, shows or hides the session: every line you committed, with its result or its error. **↑** and **↓** bring earlier lines back into the expression line. Click a line to insert its result, or **⌥-click** (Alt-click) to insert its expression. Right-click a line to copy or insert its result or expression, or to delete it; the lines after it are worked out again. **⇧⌘⌫** clears the session, with Undo in the status bar. With the expression line empty, **⌘Z** and **⇧⌘Z** undo and redo session changes: a new line, a deleted line or a cleared session.

## Session files

Every session is a plain text file, one calculation per line with its result as a comment (`2 * 3  # = 6`), so other apps and the `abacite session` command can read and change it. The desktop app keeps sessions in a folder: on first start it offers Documents/Abacite or a folder you choose, and **⌘O** picks another. The browser keeps sessions in its own storage, with "Stored in this browser" in the status bar, and **Open Session Folder…** opens a folder on disk. Chrome and Edge save to that folder and remember it. Firefox and Safari open it read-only: you can read its sessions, keep calculating and export a session, but new lines aren't saved, the commands that change the folder are disabled, and you pick the folder again on each visit. Each change is saved at once. The session panel's header names the open session and opens the list of sessions; **⌘N** starts a new one, named for when it was made (`2026-11-19 at 2.05 PM`), and the File menu renames, deletes or exports it. A deleted session goes to the trash, with Undo in the status bar, and **Open Trash…** brings it back.

Saving never overwrites changes made somewhere else. If the file changed or was deleted while you worked, Abacite asks whether to save yours as a copy, keep yours or use theirs. Changes made elsewhere while the session has nothing unsaved are picked up as one undo step. A failed save is retried, then shown in the status bar with Try Again, and unsaved work is kept so it can be restored on the next start.

## Commands and shortcuts

Every action has a command. **⌘K** opens the command menu to search and run them, and **⌘/** opens the Keyboard Shortcuts window, built from the same list as the menu bar.

## Settings and appearance

**⌘,** opens Settings: the appearance (system, light or dark), the keypad, the angle unit, digit grouping and whether the session shows. Settings are kept on this device, and a change in one browser tab reaches the others.

## Accessibility

Every key and control is a real button with a name for screen readers, and the keypad and the session are reachable with Tab. The display announces each committed result ("Result 14") and errors, not every keystroke. With reduced motion turned on in the system, keys don't animate.

## Command line

`abacite "2 * (3 + 4)"` prints `14` with the same engine. With no expression it reads lines from stdin as a session, keeping `ans` and variables, or shows a `> ` prompt on a terminal. `--rad` uses radians, `--full` prints all 34 digits, and `--json` prints each line as JSON. `abacite session Session.txt` works out a session file from the top and prints it with fresh results; `--write` writes them back to the file.

## Desktop and browser

The same app runs as a desktop app (Electron) and in any modern browser as static files. On macOS the desktop app has no title bar, with the traffic lights in its top row, and a translucent window. The desktop app remembers its window's place and size. Once a day at most, on start, the desktop app checks GitHub for a newer release and says so in the status bar, with Download to open its page. Nothing downloads or installs on its own.
