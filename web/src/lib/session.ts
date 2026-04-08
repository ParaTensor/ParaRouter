export type LocalUserRole = 'admin' | 'user';

export type LocalUser = {
  uid: string;
  username: string;
  email: string;
  displayName: string;
  role: LocalUserRole;
  balance?: number;
};

export type AuthSession = {
  token: string;
  user: LocalUser;
};

const SESSION_KEY = 'openhub.auth.session';

function guestUser(): LocalUser {
  return {
    uid: '',
    username: '',
    email: '',
    displayName: 'Guest',
    role: 'user',
    balance: 0,
  };
}

function currentUser(): LocalUser {
  return getAuthSession()?.user || guestUser();
}

export function getAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!parsed?.token || !parsed?.user) return null;
    const user = parsed.user as Partial<LocalUser>;
    if (!user.uid || !user.email || !user.role) return null;
    return {
      token: String(parsed.token),
      user: {
        uid: String(user.uid),
        username: String(user.username || user.email.split('@')[0] || ''),
        email: String(user.email),
        displayName: String(user.displayName || user.email),
        role: user.role === 'admin' ? 'admin' : 'user',
        balance: typeof user.balance === 'number' ? user.balance : undefined,
      },
    };
  } catch {
    return null;
  }
}

export function getAuthToken(): string {
  return getAuthSession()?.token || '';
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthSession()?.token);
}

export function setAuthSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('openhub-auth-changed'));
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event('openhub-auth-changed'));
}

export const localUser: LocalUser = new Proxy({} as LocalUser, {
  get(_target, prop) {
    return (currentUser() as unknown as Record<string, unknown>)[String(prop)];
  },
}) as LocalUser;
