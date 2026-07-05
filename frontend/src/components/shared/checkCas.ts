export const cas_is_valid = (value: string) => {
  if (!value) return false;
  const parts = value.split('-');
  const check_digit = parts[2];
  const formatted = parts.join('').split('').reverse();
  let sum = 0;
  formatted.forEach((d, i) => {
    sum += i * Number(d);
  });
  if (sum % 10 !== Number(check_digit)) {
    return false;
  } else return true;
};
