# Abacite — product requirements

Abacite is a calculator for one person, replacing the macOS Calculator. It runs as a desktop app (Electron), in the browser, and as an `abacite` command line, all on the same engine. Code cites this document as `PRD §n`.

## §1 Goals

1. Calculate with exact decimal arithmetic: `0.1 + 0.2` is `0.3`, money adds up to the cent, and nothing shows binary floating-point noise.
2. Type a whole expression from the keyboard and see its result as you type; the mouse is optional.
3. Keep every calculation in a session that can be reused, saved as a plain-text file and opened again.
4. Cover what the macOS Calculator's Basic and Scientific modes do, plus variables and unit conversion.
5. Never lose a session: atomic saves, conflicts shown and chosen by the user, a trash, undo.

## §2 Non-goals for 1.0

- Programmer mode (hex, octal, binary, bitwise operators, word sizes). Planned after 1.0.
- Currency conversion (needs live rates from the network).
- Complex numbers, matrices, symbolic algebra, equation solving, graphing.
- Arithmetic on quantities with units (`5 km + 3 mi`). 1.0 converts one value from one unit to another (§6).
- A NAS server. Sessions are small text files and the browser build is static, so a server adds nothing a synced folder doesn't already give. The browser build can still be hosted anywhere as static files. Revisit if sessions should live on the NAS.
- An iOS app.

## §3 Numbers

### §3.1 The decimal type

- The engine has its own decimal type: a `bigint` coefficient and a base-10 exponent. No floating point is used anywhere in a calculation, and no runtime dependency.
- Every operation's result is rounded to **34 significant digits**, round half to even (as IEEE decimal128). Sums, differences and products of numbers with fewer digits are therefore exact.
- Division, roots, powers with non-integer exponents and every function are computed with at least 10 guard digits, then rounded to 34.
- Exponents are limited to ±999 999. A larger result is the error "Result is too large." (or "too small" rounds to 0 without an error; underflow is silent).
- `-0` is shown as `0`.

### §3.2 Showing a number

- Results are shown rounded to **32 significant digits**, so the rounding of the 34th digit never shows: `1/3*3` shows `1`. The session file and `--full` in the CLI keep all 34.
- Trailing zeros after the decimal point are dropped (`2.50` shows `2.5`).
- Plain notation from `0.0000001` up to below `1e21` (the leading digit's exponent from −7 to 20); otherwise scientific notation, `1.5e+25`, `3e-9`.
- The app groups the integer part with a thin space or comma according to the **Group Digits** setting (§11), on by default with commas: `1,234,567.89`. Copying a result always copies it ungrouped (`1234567.89`). The CLI and the session file never group.
- The decimal mark is always `.`. Locales with a decimal comma are out of scope for 1.0.

## §4 Expressions

### §4.1 Syntax

- Numbers: `12`, `1.5`, `.5`, `5.`, `1e10`, `1.5E-3`. Underscores between digits are ignored (`1_000_000`).
- Operators, from lowest to highest precedence:
  1. `+`, `-` (also `−`)
  2. `*`, `/`, `mod` (also `×`, `÷`); `mod` has the sign of the divisor (`-7 mod 3` is `2`); implicit multiplication (`2pi`, `2 pi`, `2(3+4)`, `(1+2)(3+4)`, `3 sqrt(2)`) at this level, only before a name or `(`: two numbers in a row (`2 3`) are an error
  3. unary `-` and `+`
  4. `^` (also `**`), right-associative: `2^3^2` is `2^9`. `-2^2` is `-4`.
  5. postfix `!` (factorial) and `%` (percent)
- Parentheses `( )`. Unclosed parentheses at the end of the line are closed automatically, and the expression line shows the missing `)` greyed.
- Function calls: `name(arg, arg)`. A function always needs its parentheses: `sin 30` is "Expected `(` after `sin` at 5." A variable before `(` multiplies (`x(3)`); any other unknown name before `(` is "Unknown function `sinn` at 1."
- `#` starts a comment to the end of the line.
- Spaces are ignored.
- `2e3` is a number; `2e` is `2 * e`.

### §4.2 Percent

- `x%` is `x / 100`.
- After `+` or `-`, a percent is of the left operand: `200 + 10%` is `220`, `200 - 10%` is `180`. This applies only when the `%` term is the whole right operand of that `+` or `-`.
- `200 * 10%` is `20` (the plain rule).

### §4.3 Constants and names

- `pi` (also `π`), `e`, `tau` (2π), computed to 34 digits.
- `ans`: the result of the last committed line in the session that has one; `0` on an empty session. A line with an error leaves `ans` as it was.
- Variables (§5): any other name, letters, digits and `_`, not starting with a digit. Names are case-sensitive. Built-in names (functions, constants, `ans`, `mod`, `to`, `in`, unit names) can't be assigned.

### §4.4 Functions

| Function | Meaning | Domain errors |
| --- | --- | --- |
| `sqrt(x)`, `cbrt(x)`, `root(x, n)` | square, cube, n-th root | `sqrt` and even `root` of a negative |
| `abs(x)`, `sign(x)` |  |  |
| `round(x)`, `round(x, d)`, `floor(x)`, `ceil(x)`, `trunc(x)` | `round` is half away from zero, `d` decimal places (−34 to 34) |  |
| `exp(x)`, `ln(x)`, `log(x)` (base 10), `log2(x)`, `log(x, b)` |  | argument ≤ 0, base 1 |
| `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2(y, x)` | in the angle unit (§4.5) | `asin`/`acos` outside [−1, 1], `tan` at 90° + k·180° |
| `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh` |  | `acosh` < 1, `atanh` outside (−1, 1) |
| `x!`, `fact(x)` | integers 0 to 10 000 | negative or non-integer |
| `min(a, …)`, `max(a, …)` | one or more arguments |  |
| `rand()` | a uniform random number in [0, 1), 34 digits |  |

- `x ^ y`: an integer `y` is computed by repeated squaring (exact within 34 digits); otherwise `exp(y·ln x)`. A negative `x` with a non-integer `y` is the error "A negative number has no real power of 0.5." `0 ^ 0` is `1`. `0 ^` a negative is "Can't divide by zero."

### §4.5 Angles

- The angle unit is **Degrees** by default, or **Radians** (§11). It is shown on the display ("DEG"/"RAD") and toggled from the keypad, the menu and ⌘⇧R.
- In degrees the angle is reduced modulo 360 exactly before the function, so `sin(180)`, `cos(90)` and `tan(45)` are exactly `0`, `0` and `1`, and `tan(90)` is the error "tan is undefined at 90°."
- In radians, a trigonometric result whose magnitude is below 1e-32 is shown as `0` (so `sin(pi)` shows `0`). An angle of 1e1001 radians or more is "Angle is too large."; in degrees any angle works.

### §4.6 Errors

- An expression that can't be evaluated shows the error in place of the result, in the error colour, never a partial number. The session records the line with its error.
- Syntax errors name what was found and where, by character position counted from 1: "Unexpected `)` at 7.", "Missing a number after `*` at 4.", "Unknown function `sinn` at 1." The expression line underlines that character.
- Evaluation errors: "Can't divide by zero.", "`x` isn't defined.", "Result is too large.", "`pi` is a built-in name and can't be assigned.", and these:
  - "Can't take the square root of a negative number." and "Can't take an even root of a negative number."
  - "The logarithm needs a number above 0." and "The base of a logarithm can't be 1."
  - "asin needs a number from -1 to 1." (and `acos`), "acosh needs a number of 1 or more.", "atanh needs a number between -1 and 1."
  - "Factorial needs a whole number from 0 to 10000."
  - "The places for round must be a whole number from -34 to 34."
  - "`sin` takes 1 argument.", "`round` takes 1 or 2 arguments.", "`min` takes 1 or more arguments.", "`rand` takes no arguments."
- `atan2(0, 0)` is `0`, not an error.

## §5 Variables and memory

- `name = expr` assigns. The line's result is the value, and the session shows `x = 5` → `5`. Reassigning replaces the value from that line on.
- Variables belong to a session. They are defined by evaluating the session's lines in order (§7.2), so they come back when a session is opened.
- The scientific keypad has **MC**, **M+**, **M−** and **MR** (as the macOS Calculator). Memory is the variable `mem`: **M+** commits the line `mem = mem + <current result>`, **MC** commits `mem = 0`, and **MR** inserts `mem` into the expression line. `mem` is `0` until set. The display shows "M" while `mem` isn't 0.

## §6 Unit conversion

- `<expr> <unit> to <unit>` (also `in`, `->` and `→`) converts: `5 km to mi`, `(3+2) kg in lb`, `100 F to C`. The conversion applies to the whole line; it can't appear inside a larger expression.
- The result shows its unit: `5 km to mi` is `3.1068559611866698480871709218166 mi` (to 32 digits, trailing zeros dropped). `ans` after a conversion is the number without the unit.
- Converting between units of different kinds is the error "Can't convert km to kg."
- A unit to convert to with none to convert from (`2 to in`) is the error "Put a unit after the number to convert, as in `2 mm to in`.", naming a unit of the same kind.
- Factors are exact decimals where the definition is exact (1 in = 0.0254 m, 1 lb = 0.45359237 kg, 1 US gal = 3.785411784 L).
- Categories and units, each with its symbol and plural and singular names (`km`, `kilometer`, `kilometers`, `kilometre`):
  - Length: mm, cm, m, km, in, ft, yd, mi, nmi.
  - Mass: mg, g, kg, t (tonne), oz, lb, st.
  - Volume: mL, cL, L, tsp, tbsp, fl oz (`floz`), cup, pt, qt, gal (US), m³ (`m3`), cm³ (`cm3`).
  - Temperature: C, F, K (offset conversions, `°C` and `degC` also accepted).
  - Time: ms, s, min, h, day, week, year (365.25 days).
  - Area: mm², cm², m², km², ha, in², ft², yd², acre, mi² (`m2`, `ft2`… also accepted).
  - Speed: m/s, km/h (`kph`), mph, kn (knot), ft/s.
  - Data: bit, B, kB, MB, GB, TB (powers of 1000) and KiB, MiB, GiB, TiB (powers of 1024).
- Unit names are case-sensitive where case matters (`mB` is not `MB`; `m` is metre, `M` is unknown). Unit names are only units after a number or `)` before `to`, or after `to`; elsewhere they are ordinary names, so a variable may be called `m`.

## §7 The session

### §7.1 Lines

- Pressing Enter (or `=`) on a non-empty expression line commits it: the session gains a line with the input and its result (or error), the expression line clears, and the result stays shown on the display until typing starts again.
- Starting a line with an operator (`+`, `-`, `*`, `/`, `^`, `%`, `mod`) prefixes `ans`: typing `* 2` after a result gives `ans * 2`, shown in the line as typed with a greyed `ans` in front.
- Enter on an empty line repeats the last operation on the new result, like `=` on the macOS Calculator: after `5 + 3` → `8`, Enter commits `ans + 3`. After a line with no binary operator at the top, or one whose operand uses `ans` (`5 + ans`), it does nothing.
- ↑ and ↓ in the expression line walk back and forward through the session's inputs; ↓ past the newest restores what was being typed.
- Clicking a session line puts its result into the expression line at the cursor; ⌥-click puts its input. Its context menu: **Copy Result**, **Copy Expression**, **Insert Result**, **Insert Expression**, **Delete Line**.
- A session holds up to 10 000 lines; at the limit the oldest line is dropped when a new one is committed, the remaining lines keep their results, and the status bar says so once per session. They keep them until the session is evaluated again (deleting a line, reopening the session), which starts from the new top line (§7.2), so a line that used a variable or `ans` from a dropped line then shows an error or a new result.

### §7.2 Evaluating a session

- A session's results are always the evaluation of its lines in order, from the top, with `ans` the previous line's result and variables as assigned so far. Deleting a line re-evaluates the lines after it, so a line using a deleted variable becomes an error.
- `rand()` lines keep the value they were given when committed; they are not re-rolled on re-evaluation (the value is written in the session file, §8.1).

### §7.3 Undo

- ⌘Z and ⇧⌘Z undo and redo session changes: committing a line, deleting a line, clearing the session. Clearing the session (⇧⌘⌫, **Clear Session**) is one undo step with the notice "Cleared 14 lines." and **Undo**.
- In the expression line, ⌘Z undoes text editing (the text field's own undo) while the line has text; with the line empty, it undoes the last session change. A page can't see whether the field's own undo has steps left, so an empty line is the signal. In classic entry the same holds for the calculation being entered. The menu bar's Edit → Undo stays the text field's undo.
- Up to 100 session changes are kept for undo.
- Settings changes are not undo steps.

## §8 Session files

### §8.1 Format

- A session is a UTF-8 text file with `.txt` extension and LF line endings (CRLF read too). Each calculation is one line: the input, two spaces, and a result comment: `x = 5 * 3  # = 15`. An error is written `1/0  # error: Can't divide by zero.`. A `rand()` line writes its value as `rand()  # = 0.53...  (rand)`, and that value is kept on reading. A line whose result isn't the one value drawn lists the values: `rand() + rand()  # = 0.75  (rand 0.25 0.5)`.
- Results are written with all 34 digits, ungrouped.
- On reading, the result comment of every line is ignored and the session is re-evaluated (§7.2), except a `(rand)` value. A blank line and a line starting with `#` are kept as notes, shown in the session in grey, and written back unchanged.
- An optional first line `# abacite: angle=rad` sets the session's angle unit while evaluating; a session without it uses degrees. The line is written when the session's angle unit is radians.
- A file read and written with no changes is byte-identical when it already used this format.

### §8.2 The session folder

- The desktop app and the browser keep sessions in a folder the user picks; each `*.txt` directly in it is a session. First start on desktop asks **Use Documents/Abacite** (created when chosen) or **Choose Folder…**; a missing remembered folder (an unplugged drive) is named in the same question and nothing is created in its place.
- The browser starts with sessions in its own storage, and the status bar says "Stored in this browser". Where the browser has the File System Access API, **Open Session Folder…** (⌘O) picks a folder on disk, which is remembered (the browser may ask to allow it again on a later visit), and **Keep Sessions in This Browser** goes back. **Export Session…** downloads the `.txt`; on desktop it asks where to save it.
- A new session is named for when it was made, date first so the list sorts by day: `2026-11-19 at 2.05 PM.txt`. The time uses a dot, as macOS screenshots do, because a file name can't hold a colon everywhere. A second session from the same minute adds the seconds (`2026-11-19 at 2.05.09 PM`), then ` 2`. **Rename Session…** gives it any other name.
- An empty folder gets one new session on first start (no welcome card).
- The session panel's header names the open session and opens a list of the folder's sessions (also **Open Session…**). Opening a session sets the angle unit to the session's. **New Session** (⌘N) makes a new session and opens it; **Rename Session…** renames the file; **Delete Session** moves it to `.abacite/trash/` with the notice "Moved Groceries to the trash." and **Undo**. **Open Trash…** lists trashed sessions with **Restore**; restoring a name that's taken adds ` 2`.
- The open session is remembered per folder and reopened on start.

### §8.3 Saving

- Every session change is saved immediately; saves to one file never overlap (a change during a save is saved right after it). Saves are atomic (temp file beside it, then rename), and the desktop app holds a `.<name>.lock` file while checking the version and writing.
- A failed save is retried twice (300 ms, 600 ms), then the status bar shows "Couldn't save <session>." with **Try Again** until a save works.
- Every read returns a version (SHA-256 of the bytes); a save with a stale version fails with a conflict. The conflict dialog, "<Session> changed somewhere else", offers **Save Mine as a Copy** (default; writes `<name> copy <YYYY-MM-DD-HHmmss>.txt` and loads the file on disk), **Keep Mine** and **Use Theirs**. Nothing merges and nothing is overwritten without the user choosing. A file deleted elsewhere offers the same three choices under "<Session> was deleted somewhere else".
- Changes made elsewhere (an editor, the CLI) are picked up when the window comes to the front and every 15 s while it's in front, when the session has nothing unsaved; they are one undo step with "Updated <session> with changes made elsewhere." and **Undo**.
- Every 30 s while anything is unsaved, and on closing, the unsaved session is written to the app's storage as a snapshot. On start, a snapshot newer than its file opens the recovery dialog: **Restore** (default) or **Discard**.

## §9 The window

### §9.1 Layout

- From top to bottom: the **display**, the **expression line**, the **keypad**. The **session panel** sits to the right of them, shown or hidden with ⌘T. It sits beside the keypad when the window is at least 640 px wide; below that it overlays the keypad.
- The display shows the live result of the expression line, right-aligned in a large font that shrinks to fit up to 32 digits, then scrolls. Above it in small text: "DEG"/"RAD", "M" when memory is set, and the entry mode in classic mode. While the line is empty, the display shows the last result.
- Live results appear as you type, after each keystroke; an incomplete expression (`2 +`) shows the last complete result greyed, not an error. Errors show only on commit or when the expression is complete and fails (`1/0`).
- The status bar at the bottom holds notices and, in the browser, the storage note.
- Desktop: a compact default window, about 400 × 620 in Basic with the session hidden; minimum 300 × 460. Switching to Scientific (⌘2) or showing the session widens the window to fit when it is too narrow. The window remembers its size and position, and the mode.

### §9.2 Keypads

- **Basic** (⌘1): `AC`/`C`, `±`, `%`, `÷`; `7 8 9 ×`; `4 5 6 −`; `1 2 3 +`; `0`, `.`, `=`. `C` clears the expression line; `AC` (shown when the line is empty) clears the line and the display's last result but not the session. Plus `⌫`, `(` and `)` in a narrow row above, because the expression line needs them.
- **Scientific** (⌘2): Basic plus a block to its left: `(`, `)`, `mc`, `m+`, `m−`, `mr`; `x²`, `x³`, `xʸ`, `eˣ`, `10ˣ`; `1/x`, `√x`, `∛x`, `ʸ√x`, `ln`, `log₁₀`; `x!`, `sin`, `cos`, `tan`, `e`, `EE`; `Deg/Rad`, `sinh`, `cosh`, `tanh`, `π`, `Rand`; `2nd` switches `sin`… to `sin⁻¹`… and `eˣ` to `2ˣ`, `ln` to `log₂`.
- In expression entry, keys insert text at the cursor: a digit inserts the digit; `sin` inserts `sin(`; `x²` inserts `^2`; `1/x` wraps the expression line (or the selection) as `1/(…)`; `±` negates the number at the cursor, or wraps the line as `-(…)` when the cursor isn't in a number; `=` commits.
- Every key has an accessible name ("Square root", "Divide") and shows its keyboard equivalent on hover after 1 s.

### §9.3 Classic entry

- **Classic Entry** (a setting, and ⌘E to switch) makes the keypad work like the macOS Calculator: the display shows the number being entered, operators apply as they are pressed with normal precedence (`2 + 3 × 4 =` is `14`), `=` commits the whole calculation to the session as an expression (`2 + 3 * 4  # = 14`), and pressing `=` again repeats the last operation.
- Typing still works: digits, operators and Enter drive the same keys. The expression line is hidden and the display shows the pending calculation in small text above the number.
- Functions apply to the number shown at once (`9 √` → `3`), like the macOS Calculator.
- `%` after `+` or `−` shows the amount it adds or takes away (`200 + 10 %` shows `20`, then `=` gives `220`), like the macOS Calculator; elsewhere it shows `x / 100`.

## §10 Commands and keys

All commands are in one catalog, which feeds the keyboard, ⌘K, the menu bar, context menus, the Keyboard Shortcuts window (⌘/) and `docs/controls.md`.

| Group | Command | Keys |
| --- | --- | --- |
| File | New Session | ⌘N |
| File | Open Session… |  |
| File | Open Session Folder… (desktop, and browsers with the File System Access API) | ⌘O |
| File | Keep Sessions in This Browser (those browsers) |  |
| File | Rename Session…, Delete Session, Export Session…, Open Trash… |  |
| File | Settings… | ⌘, |
| Edit | Undo, Redo | ⌘Z, ⇧⌘Z |
| Edit | Copy Result | ⇧⌘C |
| Edit | Paste | ⌘V (pasted text is cleaned: grouping commas and spaces in numbers removed, `×÷−` kept) |
| Edit | Clear Line | Esc |
| Edit | Clear Session | ⇧⌘⌫ |
| View | Basic, Scientific | ⌘1, ⌘2 |
| View | Show/Hide Session | ⌘T |
| View | Classic Entry | ⌘E |
| View | Degrees/Radians | ⇧⌘R |
| Help | Command Menu | ⌘K |
| Help | Keyboard Shortcuts | ⌘/ |

- In expression entry every printable key types into the expression line, which keeps focus whenever no dialog is open; Enter commits; ↑/↓ walk the session (§7.1).

## §11 Settings

Stored in the app's own storage (desktop: its data folder; browser: local storage), not in the session folder:

- Theme: System (default), Light, Dark.
- Mode: Basic or Scientific. Entry: Expression (default) or Classic.
- Angle unit for new sessions: Degrees (default) or Radians. The open session's angle unit is toggled with ⇧⌘R and saved in its file (§8.1).
- Group Digits: on (default) or off.
- Show Session: on or off.

In the browser, a change in one tab reaches the other open tabs at once. Each tab keeps the angle unit of its own open session.

## §12 Desktop

- Electron, with the web build inside. Native menu bar from the command catalog. One window. Closing the window quits on every platform.
- On macOS the window has no title bar: the traffic lights sit in the app's own top row, which drags the window, and the window is translucent behind the app. Full screen drops the room kept for the lights. Windows and Linux keep their own frame and menu bar.
- It looks and acts like a desktop app, in the browser too: the arrow cursor over controls, text selection only in text fields and the result, and no page bounce when scrolling.
- `ABACITE_HEADLESS=1` runs with no visible window, for checks.
- Updates: the app checks GitHub releases on start (once a day at most) and says "Abacite X.Y is available." with **Download** in the status bar; nothing installs on its own.

## §13 CLI

- `abacite "2 * (3 + 4)"` prints `14`. Several arguments are joined with spaces (`abacite 2 + 2`). Exit code 0 on success, 1 on an evaluation or syntax error (the message on stderr), 2 on a usage error.
- With no expression and stdin not a terminal, each stdin line is a session line: evaluated in order, with `ans` and variables, printing one result per line (`error: …` for an error line, exit code 1 if any line failed).
- With no expression on a terminal, a simple prompt (`> `) reads lines until EOF or `exit`, keeping `ans` and variables.
- `--rad` sets radians (default degrees). `--full` prints all 34 digits instead of 32. `--json` prints `{"input", "result", "unit", "error"}` per line (`unit` is null unless the line converts, §6).
- `abacite session <file.txt>` evaluates a session file and prints it in the session format with fresh results (§8.1); `--write` writes those results back to the file atomically.
- The CLI groups no digits and needs no settings file.

## §14 Accessibility

- The display is a live region announcing the committed result ("Result 14") and errors, not every keystroke.
- Every keypad key is a real button with an accessible name; the keypad and session are reachable with Tab; reduced-motion turns off key-press animation.

## §15 Decisions

- Own decimal type instead of a library: the engine stays dependency-free and every rounding rule is ours and tested.
- 34 digits computed, 32 shown: hides last-digit rounding without claiming more accuracy than we have.
- Text session files: readable and editable in any editor; results are comments so a hand-edited session re-evaluates correctly.
- No NAS server (§2).

## §16 Open questions

- None at the moment.
