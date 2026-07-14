const USER_ID_KEY = 'userId';
const USERNAME_KEY = 'username';

const AUTH_EVENT = 'codesync:auth-changed';

export interface AuthSession {
  userId: string;
  username: string;
}

function emitAuthChanged() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function getUserId() {
  return localStorage.getItem(USER_ID_KEY);
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY);
}

export function hasSession() {
  return !!getUserId();
}

export function setSession(session: AuthSession) {
  localStorage.setItem(USER_ID_KEY, session.userId);
  localStorage.setItem(USERNAME_KEY, session.username);
  emitAuthChanged();
}

export function clearSession() {
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
