'use client';
import { useCallback, useState, type SetStateAction } from 'react';

export function useEditorHistory<T>(initial: T | (() => T)) {
  const [history, setHistory] = useState(() => ({ value: typeof initial === 'function' ? (initial as () => T)() : initial, past: [] as T[], future: [] as T[], editedAt: 0 }));
  const setValue = useCallback((action: SetStateAction<T>) => {
    const now = Date.now();
    setHistory((current) => {
      const next = typeof action === 'function' ? (action as (value: T) => T)(current.value) : action;
      if (Object.is(next, current.value)) return current;
      return { value: next, past: now - current.editedAt < 600 ? current.past : [...current.past.slice(-59), current.value], future: [], editedAt: now };
    });
  }, []);
  const reset = useCallback((value: T) => setHistory({ value, past: [], future: [], editedAt: 0 }), []);
  const undo = useCallback(() => setHistory((current) => current.past.length ? { value: current.past.at(-1)!, past: current.past.slice(0, -1), future: [current.value, ...current.future], editedAt: 0 } : current), []);
  const redo = useCallback(() => setHistory((current) => current.future.length ? { value: current.future[0], past: [...current.past, current.value], future: current.future.slice(1), editedAt: 0 } : current), []);
  return { value: history.value, setValue, reset, undo, redo, canUndo: Boolean(history.past.length), canRedo: Boolean(history.future.length) };
}
