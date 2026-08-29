/** True when the request carries a Supabase SSR session cookie (not PKCE verifier). */
export function requestHasSupabaseSessionCookie(cookies: { getAll: () => { name: string; value: string }[] }): boolean {
  return cookies.getAll().some((cookie) => {
    const name = cookie.name;
    if (!name.includes('auth-token')) return false;
    if (name.includes('code-verifier')) return false;
    return Boolean(cookie.value?.trim());
  });
}
