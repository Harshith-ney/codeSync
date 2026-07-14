const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_ID_KEY = 'userId';
const USERNAME_KEY = 'username';

const AUTH_EVENT = 'codesync:auth-changed';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  username: string;
}

function emitAuthChanged() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getUserId() {
  return localStorage.getItem(USER_ID_KEY);
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY);
}

export function hasSession() {
  return !!getAccessToken();
}

export function setSession(session: AuthSession) {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  localStorage.setItem(USER_ID_KEY, session.userId);
  localStorage.setItem(USERNAME_KEY, session.username);
  emitAuthChanged();
}

export function updateAccessToken(accessToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  emitAuthChanged();
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USERNAME_KEY);
  emitAuthChanged();
}

export function subscribeToAuthChanges(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(AUTH_EVENT, callback);

  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(AUTH_EVENT, callback);
  };
}
