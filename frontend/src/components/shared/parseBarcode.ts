export const parseBarcode = (raw: string): string | null => {
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart));
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
};
