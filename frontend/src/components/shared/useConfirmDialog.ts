import { useState } from 'react';

// Tracks which item (if any) is pending confirmation, so a list/tree of rows
// can share a single ConfirmDialog instance instead of one dialog per row.
// `target` carries whatever the caller needs at confirm time (an id, or an
// {id, name} pair for the confirmation message).
export const useConfirmDialog = <T>() => {
  const [target, setTarget] = useState<T | null>(null);

  return {
    target,
    isOpen: target !== null,
    request: (value: T) => setTarget(value),
    cancel: () => setTarget(null),
  };
};
