import { TextField } from '@mui/material';
import { useState } from 'react';
import type { ScanTarget } from '../../../scanner/identify';
import { readIdBox } from '../../../scanner/parseIdList';

type AddByIdFieldProps = {
  // Which items this list takes, and how to say so in an error
  accepts: (target: ScanTarget) => boolean;
  describeAccepted: string;
  placeholder: string;
  onAdd: (target: ScanTarget) => void;
};

// Typing or pasting ids instead of scanning: "CHEM-12, CHEM-13". Each entry
// is added as soon as a comma (or line break) follows it, and the last one
// on Enter. Entries that aren't usable stay in the box with the reason
// underneath. See readIdBox.
export function AddByIdField({ accepts, describeAccepted, placeholder, onAdd }: AddByIdFieldProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const read = (value: string, flush: boolean) => {
    const result = readIdBox(value, flush, accepts, describeAccepted);
    result.add.forEach(onAdd);
    setText(result.text);
    if (result.add.length > 0 || result.error || flush) setError(result.error);
  };

  return (
    <TextField
      label="Add by ID"
      placeholder={placeholder}
      value={text}
      onChange={(e) => read(e.target.value, false)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        // Enter adds the last entry; it never submits the panel.
        e.preventDefault();
        read(text, true);
      }}
      error={!!error}
      helperText={error ?? 'Separate several with commas; Enter adds the last one.'}
      fullWidth
      size="small"
      slotProps={{
        htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false },
      }}
    />
  );
}
