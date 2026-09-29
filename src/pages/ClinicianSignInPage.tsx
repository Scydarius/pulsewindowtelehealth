import { ArrowLeft, LockKeyhole, LogIn } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hasClinicalDatabaseConfiguration, supabase } from '../services/supabase';
import { verifyClinicianAccess } from '../services/clinicAccess';

export function ClinicianSignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const client = supabase;
    if (!client) { setRestoring(false); return; }
    void client.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setRestoring(false); return; }
      try { await verifyClinicianAccess(session.access_token); navigate('/clinician', { replace: true }); }
      catch { await client.auth.signOut({ scope: 'local' }); setRestoring(false); }
    });
  }, [navigate]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true); setMessage('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setMessage(error.message); return; }
      if (!data.session) { setMessage('Your sign-in could not be completed. Please try again.'); return; }
      try {
        await verifyClinicianAccess(data.session.access_token);
        const next = (location.state as { from?: string } | null)?.from ?? '/clinician';
        navigate(next, { replace: true });
      } catch (accessError) {
        await supabase.auth.signOut({ scope: 'local' });
        setMessage(accessError instanceof Error ? accessError.message : 'Clinician access could not be verified. Please try again.');
      }
    } catch {
      setMessage('Unable to sign in. Please try again.');
    } finally { setSubmitting(false); }
  };

  if (restoring) return <main className="access-page"><div className="session-loading"><LockKeyhole /><strong>Checking your secure sign-in…</strong></div></main>;

  return <main className="access-page">
    <section className="access-card">
      <Link to="/" className="back-link"><ArrowLeft size={18} /> Back to Ventricura</Link>
      <div className="access-icon"><LockKeyhole /></div>
      <p className="eyebrow">Clinician access</p>
      <h1>Sign in to your workspace</h1>
      <p>Use your approved clinician work email as your username, then enter the password you set up for that email.</p>
      {!hasClinicalDatabaseConfiguration ? <p className="access-warning">Clinical access is not configured yet. Add the Supabase environment settings before inviting real patients.</p> : <form onSubmit={(event) => void signIn(event)} className="access-form">
        <label>Work email <span className="field-hint">(username)</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@clinic.com" autoComplete="email" required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        <button className="button button-primary button-full" disabled={submitting}><LogIn size={18} /> {submitting ? 'Signing in…' : 'Sign in'}</button>
      </form>}
      <Link className="password-help-link" to="/clinician/forgot-password">Forgot password?</Link>
      <p className="account-help">This workspace is restricted to administrator-approved clinicians. Need access? Ask a Ventricura administrator to add your work email.</p>
      {message && <p className="access-message" role="status">{message}</p>}
    </section>
  </main>;
}
