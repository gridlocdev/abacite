/**
 * The page's only effects outside the shared components. Each one keeps a piece of the DOM in step with the
 * model (a field's text and caret, focus, a scroll position); none copies one piece of state into another.
 */
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { probeKeys } from '../commands/keys.ts';
import { nextFrame } from '../schedule.ts';

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

/**
 * Focuses the element each time `when` turns true, before the next key can land anywhere else, unless the keyboard
 * is already on something (a closing dialog gave it back to where it was).
 */
export function useFocusWhen(ref: RefObject<HTMLElement | null>, when: boolean): void {
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (when && (active === null || active === document.body)) ref.current?.focus();
  }, [ref, when]);
}

/**
 * Takes focus back to the element when a click on empty space leaves focus nowhere. It waits for the pointer to
 * come up, and leaves focus alone while text is selected, so dragging over a result selects it to copy.
 * `allowed` says whether the element may take focus now (no dialog is open).
 */
export function useTakeBackFocus(ref: RefObject<HTMLElement | null>, allowed: () => boolean): void {
  const may = useRef(allowed);
  may.current = allowed;
  useEffect(() => {
    let held = false;
    const back = () =>
      nextFrame(() => {
        const el = ref.current;
        if (!el || held || document.activeElement !== document.body || !may.current()) return;
        if (document.getSelection()?.isCollapsed === false) return;
        el.focus();
      });
    const down = (e: PointerEvent) => {
      held = true;
      // A click on something that can't be selected drops the selection, as in a native app; the page
      // only does that itself for selectable text.
      const target = e.target instanceof Element ? e.target : null;
      if (target && getComputedStyle(target).userSelect === 'none')
        document.getSelection()?.removeAllRanges();
    };
    const up = () => {
      held = false;
      back();
    };
    const out = (e: FocusEvent) => {
      // Tabbing to a key keeps focus there.
      if (e.relatedTarget === null) back();
    };
    const el = ref.current;
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    el?.addEventListener('blur', out);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      el?.removeEventListener('blur', out);
    };
  }, [ref]);
}

/** Scrolls the element to its end whenever `key` changes, so the newest row stays in view. */
export function useScrollToEnd(ref: RefObject<HTMLElement | null>, key: unknown): void {
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [ref, key]);
}

/**
 * Keeps the keyboard in a popup menu: focuses its first enabled button when it opens, calls `onClose` on a
 * pointer press outside it or when the window loses focus, and gives focus back to where it was on closing, or
 * hands that to `restore` when the place it came from may have changed.
 */
export function usePopupFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  restore?: (previous: HTMLElement | null) => void,
): void {
  const back = useRef(restore);
  back.current = restore;
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
      if (back.current) back.current(previous);
      else previous?.focus();
    };
  }, [ref, onClose]);
}

/**
 * "Press a shortcut" (PRD §10): while `on`, every key but Escape goes to `onKey` instead of the app. It ends on
 * Escape, `stop()`, an error in `onKey`, or when the component goes away, so no key stays taken.
 */
export function useKeyProbe(onKey: (e: KeyboardEvent) => void): {
  readonly on: boolean;
  start(): void;
  stop(): void;
} {
  const [on, setOn] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const handler = useRef(onKey);
  handler.current = onKey;
  const stop = () => stopRef.current?.();
  useEffect(() => stop, []);
  return {
    on,
    stop,
    start() {
      stop();
      setOn(true);
      stopRef.current = probeKeys(
        window,
        (e) => handler.current(e),
        () => {
          stopRef.current = null;
          setOn(false);
        },
      );
    },
  };
}

/**
 * Keeps the keyboard on the item app state says is focused (roving focus): when `focused` changes, `item()` takes
 * focus, as long as the keyboard is in `group` or nowhere. Nothing moves while the keyboard is somewhere else.
 */
export function useRovingFocus(
  group: RefObject<HTMLElement | null>,
  focused: unknown,
  item: () => HTMLElement | null | undefined,
): void {
  const find = useRef(item);
  find.current = item;
  const was = useRef(focused);
  useLayoutEffect(() => {
    // Only a change moves the keyboard: an item drawn as focused when the group appears leaves it where it is.
    if (was.current === focused) return;
    was.current = focused;
    if (focused === null || focused === undefined) return;
    const el = find.current();
    const active = document.activeElement;
    if (!el || el === active || !group.current) return;
    if (active && active !== document.body && !group.current.contains(active)) return;
    el.focus();
  }, [group, focused]);
}
