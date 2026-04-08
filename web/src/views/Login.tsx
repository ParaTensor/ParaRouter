import React from 'react';
import {LogIn, UserPlus, MailCheck, Globe} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {ApiError, apiPost} from '../lib/api';
import {setAuthSession, type AuthSession} from '../lib/session';
import { useTranslation } from "react-i18next";

type Mode = 'login' | 'register';

export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<Mode>('login');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');

  const [account, setAccount] = React.useState('');
  const [password, setPassword] = React.useState('');

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
    setError(err instanceof Error ? err.message : t('login.request_failed'));
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
      setMessage(t('login.verification_sent_message'));
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
      await apiPost<AuthSession>('/api/auth/register/verify', {
        email: email.trim(),
        code: verificationCode.trim(),
      });
      setMessage(t('login.registration_success_redirecting'));
      setTimeout(() => {
        setMode('login');
        setVerificationSent(false);
        setMessage('');
        setUsername('');
        setEmail('');
        setDisplayName('');
        setRegisterPassword('');
        setVerificationCode('');
      }, 3000);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-4 relative">
      <div className="absolute top-6 right-6">
        <button
          onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en')}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 bg-white border border-gray-200 rounded-full shadow-sm hover:text-zinc-900 hover:bg-gray-50 transition-colors"
        >
          <Globe size={16} />
          {i18n.language === 'en' ? '中文' : 'English'}
        </button>
      </div>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg">
            <div className="w-8 h-8 bg-white rounded-md rotate-45" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{t('login.welcome_to_openhub')}</h1>
          <p className="text-zinc-500">{mode === 'login' ? t('login.sign_in_to_continue') : t('login.create_your_account_with_email_verification')}</p>
        </div>

        <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
          <button className={`rounded-lg px-3 py-2 ${mode === 'login' ? 'bg-white shadow-sm' : 'text-zinc-500'}`} onClick={() => setMode('login')}>{t('login.login')}</button>
          <button className={`rounded-lg px-3 py-2 ${mode === 'register' ? 'bg-white shadow-sm' : 'text-zinc-500'}`} onClick={() => setMode('register')}>{t('login.register')}</button>
        </div>

        {mode === 'login' ? (
          <div className="space-y-3">
            <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder={t('login.placeholder_username_or_email')} className="w-full px-4 py-3 border rounded-xl" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={t('login.placeholder_login_password')} className="w-full px-4 py-3 border rounded-xl" />
            <button onClick={handleLogin} disabled={busy} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-bold disabled:opacity-60">
              <LogIn size={18} />
              {busy ? t('login.signing_in') : t('login.sign_in')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('login.placeholder_username')} className="w-full px-4 py-3 border rounded-xl" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t('login.placeholder_email')} className="w-full px-4 py-3 border rounded-xl" />
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('login.placeholder_display_name')} className="w-full px-4 py-3 border rounded-xl" />
            <input value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} type="password" placeholder={t('login.placeholder_password')} className="w-full px-4 py-3 border rounded-xl" />
            {!verificationSent ? (
              <button onClick={handleRequestCode} disabled={busy} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-bold disabled:opacity-60">
                <MailCheck size={18} />
                {busy ? t('login.sending_code') : t('login.send_verification_code')}
              </button>
            ) : (
              <>
                <input value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} placeholder={t('login.placeholder_verification_code')} className="w-full px-4 py-3 border rounded-xl" />
                <button onClick={handleVerifyAndRegister} disabled={busy} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-bold disabled:opacity-60">
                  <UserPlus size={18} />
                  {busy ? t('login.creating_account') : t('login.verify_and_create_account')}
                </button>
              </>
            )}
          </div>
        )}

        <div className="min-h-[24px] flex flex-col justify-center">
          {message && <p className="text-sm text-emerald-600 text-center transition-all">{message}</p>}
          {error && <p className="text-sm text-red-600 text-center transition-all">{error}</p>}
        </div>
      </div>
    </div>
  );
}
