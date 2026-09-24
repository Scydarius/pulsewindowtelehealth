import { ArrowLeft, KeyRound, LoaderCircle } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasClinicalDatabaseConfiguration, supabase } from '../services/supabase';

export function ClinicianResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'request' | 'set'>('request');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setMode('set');
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
    <h1>{mode === 'request' ? 'Set your password' : 'Choose a new password'}</h1>
    <p>{mode === 'request' ? 'Enter your work email. We will send a one-time secure link to set or reset your password.' : 'Choose a strong password for your clinician workspace.'}</p>
    {!hasClinicalDatabaseConfiguration ? <p className="access-warning">Clinical access is not configured yet.</p> : mode === 'request' ? <form onSubmit={(event) => void requestReset(event)} className="access-form"><label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><button className="button button-primary button-full" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}{saving ? 'Sending…' : 'Email password setup link'}</button></form> : <form onSubmit={(event) => void setPasswordForAccount(event)} className="access-form"><label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label><label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label><button className="button button-primary button-full" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}{saving ? 'Saving…' : 'Save password'}</button></form>}
    <button className="text-button password-mode-button" onClick={() => setMode(mode === 'request' ? 'set' : 'request')}>{mode === 'request' ? 'I opened my password-reset link' : 'Request another setup link'}</button>
    {message && <p className="access-message" role="status">{message}</p>}
  </section></main>;
}
