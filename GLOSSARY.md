# Abacite glossary

Abacite is a calculator with exact decimal arithmetic. These are the words it uses for its own things, in the UI, the docs and the code.

## Language

### Calculating

**Expression line**: The text field where you type a whole calculation, such as `2 * (3 + 4)`. The keypads type into it too. _Avoid_: input, command line, entry field

**Display**: The large area above the **expression line** that shows the **result**, with the **angle unit** and other flags above it. _Avoid_: screen, readout

**Result**: The value of a calculation, rounded once to 34 significant digits and shown to 32. While you type it is the live result; while the line isn't finished it is the last complete result, greyed. _Avoid_: answer, output

**ans**: The **result** of the last calculation in the **session**, used when a line starts with an operator (`* 3`). _Avoid_: last answer, previous result

**Variable**: A name given a value with `name = expression`, kept for later lines of the **session**.

**Memory**: The **variable** `mem`, changed by the mc, m+, m− and mr keys and shown as **M** in the **display** while it isn't 0. _Avoid_: register

**Angle unit**: Degrees or radians for trigonometry, shown as DEG or RAD in the **display** and kept with each **session**. _Avoid_: angle mode

**Unit conversion**: A calculation of the form `<expression> <unit> to <unit>`, such as `5 km to mi`, with exact factors.

### Keypads and entry

**Keypad**: The on-screen keys: **Basic**, or **Scientific**, which adds a second set of keys beside the Basic ones. `Mode` in the code. _Avoid_: mode (in the UI and docs), layout

**2nd**: The key that switches some **Scientific** keys to their inverses (arcsine, 2ˣ, log₂). _Avoid_: shift, inverse

**Classic entry**: The **entry** setting that makes the **keypad** work like a pocket calculator: no **expression line**, and operators apply as you press them. The other setting is expression entry, the default. _Avoid_: RPN, calculator mode

### Sessions

**Session**: Every calculation you committed, in order, with its **result**: the panel at the right, and a **session file** on disk. _Avoid_: tape, history, paper tape, log

**Session line**: One calculation in the **session**: the expression you committed and its **result** or error. _Avoid_: entry, row, record

**Session file**: A plain text `.txt` file holding one **session**, one **session line** per line with its result as a comment (`2 * 3  # = 6`). Named for when it was made, such as `2026-11-19 at 2.05 PM`, until you rename it.

**Session folder**: The folder that holds the **session files**: Documents/Abacite or one you choose on desktop, or the browser's own storage. _Avoid_: library, notebook, workspace

**Trash**: Where a deleted **session** goes, `.abacite/trash/` in the **session folder**, until **Open Trash…** restores it. _Avoid_: recycle bin

**Conflict**: A **session file** that changed or was deleted elsewhere while the **session** had unsaved changes. Abacite asks whether to save yours as a copy, keep yours or use theirs.

**Snapshot**: A copy of an unsaved **session** kept in the app's storage, offered for restoring on the next start. _Avoid_: backup, autosave file

### The app

**Command**: One action the app can do, with its title and shortcut. The command menu, the shortcuts, the menu bar and the Keyboard Shortcuts window all come from one list of commands. _Avoid_: action

**Command menu**: The search box opened with **⌘K** that finds and runs a **command**. _Avoid_: command palette

**Status bar**: The strip at the bottom of the window with **notices**, the session panel button and the Settings button.

**Notice**: A short message in the **status bar**, sometimes with an action such as **Undo**. _Avoid_: toast, snackbar

## Relationships

- A **session folder** holds many **session files**; each **session file** holds one **session**.
- A **session** holds many **session lines**, and has one **angle unit**.
- **ans**, **variables** and **memory** belong to a **session**: each **session line** sees the ones made above it.
- One **session** is open at a time.

## Flagged ambiguities

- "Tape" was the first name for the **session**. The UI, the docs and the code say **session** now, but stored names still use the old word (the browser storage folder `tapes` and the setting `abacite.lastTape.*`) so existing data keeps working.
- "Line" means both the **expression line** and a **session line**. Always say which.
- "Mode" is the **keypad** in the code (`Mode`, `setMode`). The UI says **Keypad**, and the entry setting is **classic entry** or expression entry.
- "Clear" is the session panel's **Clear** (empties the **session**, with Undo), while the keypad's **AC** and **C** clear the **expression line** and the **result**.
