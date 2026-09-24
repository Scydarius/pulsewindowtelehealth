import { ArrowLeft, KeyRound, LoaderCircle } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasClinicalDatabaseConfiguration, supabase } from '../services/supabase';

export function ClinicianResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'request' | 'set'>('request');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAccountEmail(session.user.email ?? 'your clinician account');
        setMode('set');
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAccountEmail(session.user.email ?? 'your clinician account');
        setMode('set');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const requestReset = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return; setSaving(true); setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/clinician/reset-password` });
    setSaving(false); setMessage(error ? error.message : 'Check your email for a secure password-reset link.');
  };
  const setPasswordForAccount = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return;
    if (password.length < 12) { setMessage('Use at least 12 characters for your password.'); return; }
    if (password !== confirmPassword) { setMessage('The passwords do not match.'); return; }
    setSaving(true); setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    navigate('/clinician');
  };

  return <main className="access-page"><section className="access-card">
    <Link to="/clinician/sign-in" className="back-link"><ArrowLeft size={18} /> Back to sign in</Link>
    <div className="access-icon"><KeyRound /></div><p className="eyebrow">Clinician access</p>
    <h1>{mode === 'request' ? 'Forgot your password?' : 'Reset your password'}</h1>
    <p>{mode === 'request' ? 'Enter the work email you use to sign in. If it belongs to a clinician account, we will send a one-time password-reset link to that inbox.' : <>This link confirms that you control <strong>{accountEmail || 'your clinician email'}</strong>. Choose a new password for that existing clinician account.</>}</p>
    {!hasClinicalDatabaseConfiguration ? <p className="access-warning">Clinical access is not configured yet.</p> : mode === 'request' ? <form onSubmit={(event) => void requestReset(event)} className="access-form"><label>Work email <span className="field-hint">(your username)</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@clinic.com" autoComplete="email" required /></label><button className="button button-primary button-full" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}{saving ? 'Sending…' : 'Send password-reset link'}</button></form> : <form onSubmit={(event) => void setPasswordForAccount(event)} className="access-form"><label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label><label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label><button className="button button-primary button-full" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}{saving ? 'Saving…' : 'Save new password'}</button></form>}
    {mode === 'set' && <Link className="password-help-link" to="/clinician/sign-in">I already have a password — sign in</Link>}
    {message && <p className="access-message" role="status">{message}</p>}
  </section></main>;
}
