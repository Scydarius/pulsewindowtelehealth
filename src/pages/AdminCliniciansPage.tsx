import { ArrowLeft, CircleAlert, LoaderCircle, UserPlus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { getClinicianAccessToken } from '../services/clinicAccess';

export function AdminCliniciansPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const accessToken = await getClinicianAccessToken();
      const response = await fetch('/api/admin-clinicians', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ displayName, email }),
      });
      const body = await response.json().catch(() => ({ error: 'The clinician invitation service is unavailable.' })) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to add clinician.');
      setMessage(body.message ?? 'Invitation sent.'); setDisplayName(''); setEmail('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add clinician.'); }
    finally { setSaving(false); }
  };

  return <div className="admin-page">
    <Link to="/clinician" className="back-link"><ArrowLeft size={18} /> Back to workspace</Link>
    <section className="admin-card">
      <p className="eyebrow">Clinic administration</p><h1>Add a clinician</h1>
      <p>Invite a clinician using their work email. If they already have a PulseWindow account, this safely adds clinician access and sends a password-setup email instead.</p>
      <form onSubmit={(event) => void submit(event)} className="access-form">
        <label>Clinician name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Dr Taylor Morgan" required /></label>
        <label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@clinic.com" required /></label>
        <button className="button button-primary button-full" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <UserPlus size={18} />}{saving ? 'Sending invitation…' : 'Send clinician invitation'}</button>
      </form>
      {message && <p className="access-message">{message}</p>}
      {error && <p className="form-error"><CircleAlert size={16} /> {error}</p>}
    </section>
  </div>;
}
