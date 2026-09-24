import { ArrowLeft, LockKeyhole, Mail } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasClinicalDatabaseConfiguration, supabase } from '../services/supabase';

export function ClinicianSignInPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/clinician` },
    });
    setSubmitting(false);
    setMessage(error ? error.message : 'Check your email for your secure clinician sign-in link.');
  };

  return <main className="access-page">
    <section className="access-card">
      <Link to="/" className="back-link"><ArrowLeft size={18} /> Back to PulseWindow</Link>
      <div className="access-icon"><LockKeyhole /></div>
      <p className="eyebrow">Clinician access</p>
      <h1>Sign in to your workspace</h1>
      <p>Only authorised clinicians can create patient links or view consultation measurements.</p>
      {!hasClinicalDatabaseConfiguration ? <p className="access-warning">Clinical access is not configured yet. Add the Supabase environment settings before inviting real patients.</p> : <form onSubmit={(event) => void signIn(event)} className="access-form">
        <label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@clinic.com" required /></label>
        <button className="button button-primary button-full" disabled={submitting}><Mail size={18} /> {submitting ? 'Sending…' : 'Email me a sign-in link'}</button>
      </form>}
      {message && <p className="access-message" role="status">{message}</p>}
    </section>
  </main>;
}
