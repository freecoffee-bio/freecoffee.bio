export function getAdminPath(value: string | undefined): string {
  const path = value?.trim() || 'admin';
  return /^[a-zA-Z0-9_-]+$/.test(path) ? path : 'admin';
}

export function getAuthSecret(value: string | undefined): string {
  if (!value) throw new Error('BETTER_AUTH_SECRET is not configured');
  return value;
}
