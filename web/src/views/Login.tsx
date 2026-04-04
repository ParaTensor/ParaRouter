import React from 'react';
import {LogIn, UserPlus, MailCheck} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {ApiError, apiPost} from '../lib/api';
import {setAuthSession, type AuthSession} from '../lib/session';

type Mode = 'login' | 'register';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<Mode>('login');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');

  const [account, setAccount] = React.useState('admin');
  const [password, setPassword] = React.useState('admin123');

  const [username, setUsername] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [registerPassword, setRegisterPassword] = React.useState('');
  const [verificationCode, setVerificationCode] = React.useState('');
  const [verificationSent, setVerificationSent] = React.useState(false);

  const handleError = (err: unknown) => {
    if (err instanceof ApiError) {
      const bodyMessage = err.body?.error;
      setError(bodyMessage || err.message);
      return;
    }
    setError(err instanceof Error ? err.message : 'request failed');
  };

  const handleLogin = async () => {
    if (!account.trim() || !password.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const loginAccount = account.trim();
      let session: AuthSession;
      try {
        session = await apiPost<AuthSession>('/api/auth/login', {
          username: loginAccount,
          password,
        });
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 400) {
          throw err;
        }
        try {
          session = await apiPost<AuthSession>('/api/auth/login', {
            account: loginAccount,
            password,
          });
        } catch (fallbackErr) {
          if (!(fallbackErr instanceof ApiError) || fallbackErr.status !== 400) {
            throw fallbackErr;
          }
          session = await apiPost<AuthSession>('/api/auth/login', {
            account: loginAccount,
            username: loginAccount,
            password,
          });
        }
      }
      setAuthSession(session);
      navigate('/models');
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRequestCode = async () => {
    if (!username.trim() || !email.trim() || !registerPassword.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiPost('/api/auth/register/request', {
        username: username.trim(),
        email: email.trim(),
        display_name: displayName.trim() || username.trim(),
        password: registerPassword,
      });
      setVerificationSent(true);
      setMessage('Verification code sent. Please check your email.');
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyAndRegister = async () => {
    if (!email.trim() || !verificationCode.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const session = await apiPost<AuthSession>('/api/auth/register/verify', {
        email: email.trim(),
        code: verificationCode.trim(),
      });
      setAuthSession(session);
      navigate('/models');
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg">
            <div className="w-8 h-8 bg-white rounded-md rotate-45" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Welcome to OpenHub</h1>
          <p className="text-zinc-500">{mode === 'login' ? 'Sign in to continue.' : 'Create your account with email verification.'}</p>
        </div>

        <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
          <button className={`rounded-lg px-3 py-2 ${mode === 'login' ? 'bg-white shadow-sm' : 'text-zinc-500'}`} onClick={() => setMode('login')}>Login</button>
          <button className={`rounded-lg px-3 py-2 ${mode === 'register' ? 'bg-white shadow-sm' : 'text-zinc-500'}`} onClick={() => setMode('register')}>Register</button>
        </div>

        {mode === 'login' ? (
          <div className="space-y-3">
            <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="username or email" className="w-full px-4 py-3 border rounded-xl" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="password" className="w-full px-4 py-3 border rounded-xl" />
            <button onClick={handleLogin} disabled={busy} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-bold disabled:opacity-60">
              <LogIn size={18} />
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
            <p className="text-xs text-zinc-500 text-center">Default admin: <span className="font-mono">admin / admin123</span></p>
          </div>
        ) : (
          <div className="space-y-3">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className="w-full px-4 py-3 border rounded-xl" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email" className="w-full px-4 py-3 border rounded-xl" />
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="display name (optional)" className="w-full px-4 py-3 border rounded-xl" />
            <input value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} type="password" placeholder="password (>= 8 chars)" className="w-full px-4 py-3 border rounded-xl" />
            {!verificationSent ? (
              <button onClick={handleRequestCode} disabled={busy} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-bold disabled:opacity-60">
                <MailCheck size={18} />
                {busy ? 'Sending code...' : 'Send verification code'}
              </button>
            ) : (
              <>
                <input value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} placeholder="6-digit code" className="w-full px-4 py-3 border rounded-xl" />
                <button onClick={handleVerifyAndRegister} disabled={busy} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-bold disabled:opacity-60">
                  <UserPlus size={18} />
                  {busy ? 'Creating account...' : 'Verify and create account'}
                </button>
              </>
            )}
          </div>
        )}

        {message && <p className="text-sm text-emerald-600 text-center">{message}</p>}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  );
}
