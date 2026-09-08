let token = '';
export function setOperatorToken(value: string) { token = value; }
export function apiFetch(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set('X-Rime-Client', 'local-ui');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}
