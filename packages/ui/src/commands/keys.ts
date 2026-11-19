/** The page's one keyboard listener: every key goes through the command catalog (PRD §10). */
import type { CommandCatalog, KeyFocus } from './command.ts';

/** Where keyboard focus is, for deciding which keys are commands. */
export function keyFocus(el: Element | null): KeyFocus {
  if (!el || el === el.ownerDocument?.body) return 'list';
  // The expression line always has focus, and its Enter, Escape, ↑ and ↓ are commands (PRD §10).
  if (el.closest('[data-ab-line]')) return 'list';
  if (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return 'text';
  if (el.closest('button, a, [role=button], [role=menuitem], [role=option]')) return 'control';
  return 'list';
}

/**
 * Sends key presses on `target` to the catalog. `blocked` is true while a dialog is open; then only commands
 * the catalog's gate lets through (those that toggle their own window) run, and a blocked shortcut with ⌘ or
 * Ctrl still doesn't reach the browser (Ctrl+Shift+C would open its inspector). With nothing blocked, a
 * printable key pressed on a button goes to `typeInto` (the expression line keeps the typing, PRD §10). With
 * no field to type into, a printable key or Backspace that is no command goes to `typeKey`, which returns
 * true when it used the key (classic entry, PRD §9.3). Returns a function that stops listening.
 */
export function listenForKeys(
  target: Window,
  catalog: CommandCatalog,
  blocked: () => boolean,
  typeInto?: () => HTMLElement | null,
  typeKey?: (key: string) => boolean,
): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const focus = keyFocus(target.document.activeElement);
    if (typeInto && focus === 'control' && isTyping(e) && !blocked()) {
      const field = typeInto();
      if (field) {
        // Moving focus during keydown sends the character to the newly focused field.
        field.focus();
        return;
      }
    }
    const result = catalog.forEvent(e, focus);
    if (!result) {
      const typed = isTyping(e) || (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey);
      if (typeKey && focus !== 'text' && typed && !blocked() && typeKey(e.key)) e.preventDefault();
      return;
    }
    if (result.kind === 'wait') {
      e.preventDefault();
      return;
    }
    if (blocked() && !catalog.gate?.(result.command)) {
      if (e.metaKey || e.ctrlKey) e.preventDefault();
      return;
    }
    e.preventDefault();
    catalog.run(result.command.id);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}

/** A key that types a character: one character, not a space (which presses the button), no ⌘, Ctrl or ⌥. */
function isTyping(e: KeyboardEvent): boolean {
  return [...e.key].length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing;
}
