import { useFieldSelection, useFieldValue, useFocusWhen, useTakeBackFocus } from '@abacite/ui';
import { useRef } from 'preact/hooks';
import type { AppController } from './controller.ts';

/**
 * The expression line (PRD §9.1): a text field that keeps focus while no dialog is open. Behind it, in the
 * same monospace font, a mirror draws what the typed text leaves out: `ans` in front of a leading operator,
 * the `)`s the end of the line closes, and a wavy underline under an error.
 */
export function ExpressionLine({ app }: { readonly app: AppController }) {
  const input = useRef<HTMLInputElement>(null);
  const line = app.line.value;
  const ghost = app.ghost.value;
  const dialog = app.dialog.value;

  // The controller's text and selection win over the field's (a keypad key changed them).
  useFieldValue(input, line.text, line.start, line.end);
  // Focus comes back to the line when a dialog closes.
  useFocusWhen(input, dialog === null);
  useFieldSelection(input, app.select);
  useTakeBackFocus(input, () => app.dialog.peek() === null);

  const text = line.text;
  const at = ghost.errorAt;
  const errorEnd =
    at === null
      ? 0
      : Math.min(text.length, at + Math.max(1, /^[A-Za-z_]\w*/.exec(text.slice(at))?.[0].length ?? 1));
  return (
    <div class="ab-line">
      <div class="ab-line-mirror" aria-hidden="true">
        {ghost.ans && <span class="ab-ghost">ans </span>}
        {at === null || at >= text.length ? (
          <span class="ab-typed">{text}</span>
        ) : (
          <>
            <span class="ab-typed">{text.slice(0, at)}</span>
            <span class="ab-typed ab-error-mark">{text.slice(at, errorEnd)}</span>
            <span class="ab-typed">{text.slice(errorEnd)}</span>
          </>
        )}
        {ghost.missingParens > 0 && <span class="ab-ghost">{')'.repeat(ghost.missingParens)}</span>}
      </div>
      <input
        ref={input}
        data-ab-line
        class={ghost.ans ? 'ab-line-input ab-after-ans' : 'ab-line-input'}
        aria-label="Expression"
        placeholder={app.session.value.lines.length ? '' : 'Type a calculation'}
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        autofocus
        onInput={(e) => {
          const el = e.currentTarget;
          app.setLine({
            text: el.value,
            start: el.selectionStart ?? el.value.length,
            end: el.selectionEnd ?? el.value.length,
          });
        }}
        onPaste={(e) => {
          const text = e.clipboardData?.getData('text/plain');
          if (text === undefined) return;
          e.preventDefault();
          app.paste(text);
        }}
      />
    </div>
  );
}
