// Only an explicit 401 confirms sign-out; other failures remain retryable.
export async function readClientSession({ fetcher = fetch, signal } = {}) {
  const response = await fetcher('/api/auth/session', { cache: 'no-store', signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Unable to verify your session. Please retry.');
  const data = await response.json();
  if (!data.user?.id) throw new Error('Unable to verify your session. Please retry.');
  return data.user;
}
