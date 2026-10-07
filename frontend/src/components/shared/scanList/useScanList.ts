import { useCallback, useRef, useState } from 'react';
import type { ScanTarget } from '../../../scanner/identify';

// One scanned or typed item in an Actions panel list. `detail` is whatever
// the panel looked up for it (a container, a location's path), once found.
export type ScanItem<D> = {
  key: string;
  target: ScanTarget;
  status: 'loading' | 'ready' | 'error';
  detail?: D;
  error?: string;
};

// One key per container or location, so the same item can't be listed twice.
export const targetKey = (target: ScanTarget) => `${target.kind}:${target.id}`;

// The list behind each Actions panel (Check Out, Check In, Move Containers,
// Move Locations). Each item is looked up as it's added, with `resolve`,
// which returns the detail to show or throws an Error whose message
// explains why the item can't be used (not found, discarded...).
export function useScanList<D>(resolve: (target: ScanTarget) => Promise<D>) {
  const [items, setItems] = useState<ScanItem<D>[]>([]);
  // The listed keys, kept outside React state so two scans arriving before
  // a re-render still can't list the same item twice.
  const keys = useRef(new Set<string>());

  // Returns false, adding nothing, if the item is already listed. `onReady`
  // runs once the lookup succeeds, if the item is still listed by then.
  const add = useCallback(
    (target: ScanTarget, onReady?: (item: ScanItem<D>) => void): boolean => {
      const key = targetKey(target);
      if (keys.current.has(key)) return false;
      keys.current.add(key);
      setItems((current) => [...current, { key, target, status: 'loading' }]);

      const settle = (patch: Partial<ScanItem<D>>) =>
        setItems((current) =>
          current.map((item) => (item.key === key ? { ...item, ...patch } : item))
        );
      resolve(target).then(
        (detail) => {
          settle({ status: 'ready', detail });
          if (keys.current.has(key)) onReady?.({ key, target, status: 'ready', detail });
        },
        (error: unknown) =>
          settle({
            status: 'error',
            error: error instanceof Error ? error.message : 'Could not be looked up',
          })
      );
      return true;
    },
    [resolve]
  );

  const remove = useCallback((key: string) => {
    keys.current.delete(key);
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const clear = useCallback(() => {
    keys.current.clear();
    setItems([]);
  }, []);

  return {
    items,
    add,
    remove,
    clear,
    ready: items.filter((item) => item.status === 'ready'),
    isLooking: items.some((item) => item.status === 'loading'),
    hasProblems: items.some((item) => item.status === 'error'),
  };
}
