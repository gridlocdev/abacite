/**
 * The page's only effects outside the shared components. Each one keeps a piece of the DOM in step with the
 * model (a field's text and caret, focus, a scroll position); none copies one piece of state into another.
 */
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect } from 'preact/hooks';

/** Puts `text` and the selection `start`–`end` into the field whenever they change in the model. */
export function useFieldValue(
  ref: RefObject<HTMLInputElement | null>,
  text: string,
  start: number,
  end: number,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.value !== text) el.value = text;
    if (document.activeElement === el && (el.selectionStart !== start || el.selectionEnd !== end))
      el.setSelectionRange(start, end);
  }, [ref, text, start, end]);
}

/** Calls `onSelect` with the field's selection whenever the caret moves in it. */
export function useFieldSelection(
  ref: RefObject<HTMLInputElement | null>,
  onSelect: (start: number, end: number) => void,
): void {
  useEffect(() => {
    const onSelection = () => {
      const el = ref.current;
      if (el && document.activeElement === el) onSelect(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [ref, onSelect]);
}

/** Focuses the element each time `when` turns true, before the next key can land anywhere else. */
export function useFocusWhen(ref: RefObject<HTMLElement | null>, when: boolean): void {
  useLayoutEffect(() => {
    if (when) ref.current?.focus();
  }, [ref, when]);
}

/** Scrolls the element to its end whenever `key` changes, so the newest row stays in view. */
export function useScrollToEnd(ref: RefObject<HTMLElement | null>, key: unknown): void {
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [ref, key]);
}

/**
 * Keeps the keyboard in a popup menu: focuses its first enabled button when it opens, calls `onClose` on a
 * pointer press outside it or when the window loses focus, and gives focus back to where it was on closing.
 */
export function usePopupFocus(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('blur', onClose);
      previous?.focus();
    };
  }, [ref, onClose]);
}
