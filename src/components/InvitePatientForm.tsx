import { Copy, Link2, LoaderCircle, Plus, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createPatientInvitation } from '../services/clinicAccess';
import { hasClinicalDatabaseConfiguration } from '../services/supabase';

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

export function InvitePatientForm() {
  const [open, setOpen] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [reason, setReason] = useState('Medication follow-up');
  const [startsAt, setStartsAt] = useState(tomorrow);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setLink('');
    try {
      setLink(await createPatientInvitation({ patientName, patientEmail, reason, startsAt: new Date(startsAt).toISOString() }));
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : 'Unable to create patient link.');
    } finally { setSaving(false); }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(link);
  };

  if (!open) return <button className="button button-secondary" onClick={() => setOpen(true)}><Plus size={17} /> New patient link</button>;
  return <section className="invite-panel" aria-label="Create patient invitation">
    <div className="section-heading compact"><div><p className="eyebrow">Clinician action</p><h2>Invite a patient</h2></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close invitation form"><X size={18} /></button></div>
    {!hasClinicalDatabaseConfiguration ? <p className="access-warning">Set up the clinical database first. This form cannot create real patient links until protected data storage is configured.</p> : <form onSubmit={(event) => void submit(event)} className="invite-form">
      <label>Patient name<input value={patientName} onChange={(event) => setPatientName(event.target.value)} required /></label>
      <label>Patient email<input type="email" value={patientEmail} onChange={(event) => setPatientEmail(event.target.value)} required /></label>
      <label>Appointment reason<input value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
      <label>Start time<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
      <button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />}{saving ? 'Creating…' : 'Create secure link'}</button>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {link && <div className="created-link"><strong>Patient link ready</strong><span>Share this directly with the patient. It expires 24 hours after the appointment start time.</span><div><input value={link} readOnly aria-label="Patient invitation link" /><button className="button button-secondary button-small" onClick={() => void copy()}><Copy size={16} /> Copy</button></div></div>}
  </section>;
}
