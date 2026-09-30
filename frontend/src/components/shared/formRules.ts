// Shared react-hook-form `rules` fragments for the common "Required" /
// decimal-pattern cases repeated across the inventory forms.

import { cas_is_valid } from './checkCas';

export const requiredRule = { value: true, message: 'Required' } as const;

export const required = (message: string) => ({ value: true, message });

// CAS number: required, NNNNNNN-NN-N format, and a valid check digit.
// Callers add their own duplicate checks alongside `check_digit`, e.g.
// { ...casRules, validate: { ...casRules.validate, duplicate } }.
export const casRules = {
  required: requiredRule,
  pattern: { value: /^[0-9]{2,7}-[0-9]{2}-[0-9]{1}$/, message: 'Invalid CAS format' },
  validate: {
    check_digit: (value: string) => cas_is_valid(value) || 'Invalid CAS number',
  },
};

// Lipscomb account formats — shared by Register, Profile, and UserEditForm
export const LIPSCOMB_EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@(mail\.)?lipscomb\.edu$/;
export const LIPSCOMB_ID_PATTERN = /^L[0-9]{8}$/;

export const decimalPatternRule = (message = 'Please input integer or decimal value.') => ({
  value: /^\d+(\.\d+)?$/,
  message,
});
