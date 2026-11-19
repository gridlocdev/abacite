# Features

Abacite is a calculator with exact decimal arithmetic. You type a whole expression, see its result as you type, and keep every calculation on a tape. [Controls](controls.md) lists the keys.

## Expression line

Type a whole calculation, such as `2 * (3 + 4)` or `sqrt(2) / 2`, and the display shows the result as you type. The end of the line closes any parentheses still open, shown greyed after what you typed. A line that isn't finished yet (`2 +`) leaves the last result greyed instead of showing an error, and a line that's wrong says why, with the place underlined. **Enter** puts the line on the tape. A line that starts with an operator (`* 3`) continues from the last result, shown as a greyed `ans`, and **Enter** on an empty line repeats the last operation (`+ 3` again). `name = expression` keeps a value in a variable for later lines, and `#` starts a comment. **Esc** clears the line, then the last result.

## Exact decimals

Every number is a decimal, computed to 34 significant digits and shown to 32, so `0.1 + 0.2` is `0.3` and money adds up to the cent. Large results are grouped with commas (`1,234,567`), which Settings can turn off; Copy Result (**⇧⌘C**) always copies the number without commas. `+ 10%` adds 10% of the number before it.

## Keypads

The Basic keypad has digits, the four operations, parentheses, percent and change sign; **⌘2** adds the Scientific keypad beside it with memory keys, powers, roots, logarithms, trigonometry, hyperbolic functions, π, e, factorial and a random number. **2nd** switches some keys to their inverses (arcsine, 2ˣ, log₂). Every key types into the expression line, so the keyboard and the keys mix freely. The angle key, or **⇧⌘R**, switches trigonometry between degrees and radians. In the desktop app the window grows to fit the Scientific keypad or the tape. **⌘1** goes back to Basic.

## Memory

The Scientific keypad has the memory keys. **m+** adds the result to memory and **m−** subtracts it (a calculation still being typed goes on the tape first), **mc** clears memory, and **mr** inserts it into the expression line. Memory is the variable `mem`, so each key puts an ordinary line on the tape (`mem = mem + 15`) and you can type `mem` too. The display shows **M** while memory isn't 0.

## Unit conversion

Type a value with a unit, then `to` or `in` and another unit: `5 km to mi`, `100 F to C`, `(3+2) kg in lb`, `1 GiB -> MB`. Abacite converts length, mass, volume, temperature, time, area, speed and data with exact factors, so `1 in to cm` is exactly 2.54. The result shows its unit in the display, on the tape and in the command line, while **⇧⌘C** copies the number alone and the next line's `ans` is the number. Unit names are case-sensitive (`MB` is a megabyte, `mB` is nothing), and units of different kinds give an error.

## Classic entry

**⌘E** (or **Entry** in Settings) makes the keypad work like a pocket calculator. The expression line goes away and the display shows the number you're entering, with the calculation so far in small text above it. Operators apply as you press them, with normal precedence: `2 + 3 × 4 =` is 14. Function keys work on the number shown at once (`9 √` is 3). **=** puts the whole calculation on the tape as an expression (`2 + 3 * 4`), and pressing it again repeats the last operation. The keyboard drives the same keys: digits, `+ - * / ^ % ( )`, Enter, Backspace and Esc.

## Tape

**⌘T** shows the tape: every line you committed, with its result or its error. **↑** and **↓** bring earlier lines back into the expression line. Click a line to insert its result, or **⌥-click** (Alt-click) to insert its expression. **⇧⌘⌫** clears the tape, with Undo in the status bar. In this version the tape lasts until the window closes.

## Commands and shortcuts

Every action has a command. **⌘K** opens the command menu to search and run them, and **⌘/** opens the Keyboard Shortcuts window, built from the same list as the menu bar.

## Settings and appearance

**⌘,** opens Settings: the appearance (system, light or dark), the keypad, the angle unit, digit grouping and whether the tape shows. Settings are kept on this device.

## Command line

`abacite "2 * (3 + 4)"` prints `14` with the same engine. With no expression it reads lines from stdin as a tape, keeping `ans` and variables, or shows a `> ` prompt on a terminal. `--rad` uses radians, `--full` prints all 34 digits, and `--json` prints each line as JSON.

## Desktop and browser

The same app runs as a desktop app (Electron) and in any modern browser as static files. The desktop app remembers its window's place and size.
