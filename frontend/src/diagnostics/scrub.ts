// Redaction applied to every string before it enters the diagnostics buffer.
// The buffer only ever reaches Django admin (never the public GitHub issue),
// but credentials and personal details still have no business in it.

const REDACTIONS: [RegExp, string][] = [
  // Cookie-style tokens, e.g. from a logged header or document.cookie.
  [/\b(csrftoken|sessionid|csrfmiddlewaretoken)=[^;\s&"']+/gi, '$1=[redacted]'],
  // X-CSRFToken header values.
  [/(x-csrftoken["']?\s*[:=]\s*["']?)[\w-]+/gi, '$1[redacted]'],
  // password: "...", password=..., "password":"..."
  [/(["']?password\d?["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,&}]+)/gi, '$1[redacted]'],
  // Bearer tokens.
  [/(bearer\s+)[\w.~+/-]+=*/gi, '$1[redacted]'],
  // Email addresses.
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
];

export function scrub(text: string): string {
  return REDACTIONS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text
  );
}
