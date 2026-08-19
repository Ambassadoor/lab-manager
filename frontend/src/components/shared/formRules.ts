// Shared react-hook-form `rules` fragments for the common "Required" /
// decimal-pattern cases repeated across the inventory forms.

export const requiredRule = { value: true, message: 'Required' } as const;

export const required = (message: string) => ({ value: true, message });

export const decimalPatternRule = (message = 'Please input integer or decimal value.') => ({
  value: /^\d+(\.\d+)?$/,
  message,
});
