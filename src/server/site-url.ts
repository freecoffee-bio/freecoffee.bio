export function normalizeSiteUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Site URL must use HTTP or HTTPS.');
  return url.origin;
}

export function composeSiteUrl(siteUrl: string, path: string): string {
  if (!siteUrl) throw new Error('Site URL is not configured.');
  return new URL(path, `${siteUrl}/`).toString();
}
