import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { CheckoutHolder } from '../../api/inventory';
import { userKeys } from '../../api/queryKeys';
import { lookupUserByLipscombId } from '../../api/users';
import { lipscombIdFrom } from '../../scanner/lipscombId';

// Check Out's "checked out by": one box taking a Lipscomb ID (typed, or an
// ID card's 11-digit number, scanned or typed) or a name.
// A complete ID is looked up; if an account has it, that's the holder,
// otherwise a name is asked for too (kept with the ID so the person can be
// linked later). Any other text is taken as the name.
export function useCheckoutHolder() {
  const [input, setInput] = useState('');
  const [name, setName] = useState('');

  const parsedId = lipscombIdFrom(input);
  const isId = parsedId !== null;
  const asId = parsedId ?? '';
  const lookup = useQuery({
    queryKey: userKeys.lookup(asId),
    queryFn: () => lookupUserByLipscombId(asId),
    enabled: isId,
    staleTime: 5 * 60 * 1000,
  });
  const matched = isId ? (lookup.data ?? null) : null;
  // No account has it, or the lookup failed: either way, ask for a name
  const needsName = isId && !matched && (lookup.isSuccess || lookup.isError);

  let holder: CheckoutHolder | null = null;
  if (matched) holder = { lipscomb_id: asId };
  else if (needsName && name.trim()) holder = { lipscomb_id: asId, name: name.trim() };
  else if (!isId && input.trim()) holder = { name: input.trim() };

  const display = matched?.full_name ?? (isId ? name.trim() : input.trim());

  const clear = () => {
    setInput('');
    setName('');
  };

  return {
    input,
    setInput,
    name,
    setName,
    asId,
    isId,
    lookup,
    matched,
    needsName,
    holder,
    display,
    clear,
  };
}

export type CheckoutHolderState = ReturnType<typeof useCheckoutHolder>;
