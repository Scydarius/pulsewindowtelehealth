import { ArrowLeft, KeyRound, LoaderCircle } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasClinicalDatabaseConfiguration, supabase } from '../services/supabase';

export function ClinicianActivateAccountPage() {
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) return;
    const acceptSession = (session: { user: { email?: string } } | null) => {
      if (!session) return;
      setAccountEmail(session.user.email ?? 'your clinician email');
      setReady(true);
    };
    void supabase.auth.getSession().then(({ data: { session } }) => acceptSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => acceptSession(session));
    return () => subscription.unsubscribe();
  }, []);

  const activateAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
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
    <div className="access-icon"><KeyRound /></div><p className="eyebrow">Clinician invitation</p>
    <h1>Activate your clinician account</h1>
    {!hasClinicalDatabaseConfiguration ? <p className="access-warning">Clinical access is not configured yet.</p> : !ready ? <p className="access-warning">This invitation link is invalid or has expired. Ask your PulseWindow administrator to send a new clinician invitation.</p> : <><p>Your work email is your username: <strong>{accountEmail}</strong>. Create a password to finish activating this clinician account.</p><form onSubmit={(event) => void activateAccount(event)} className="access-form"><label>Create password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label><label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label><button className="button button-primary button-full" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}{saving ? 'Activating…' : 'Activate account'}</button></form></>}
    {message && <p className="access-message" role="status">{message}</p>}
  </section></main>;
}
