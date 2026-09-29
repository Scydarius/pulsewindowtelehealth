import { CalendarDays, Clock3, Copy, Link2, LoaderCircle, Plus, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createPatientInvitation } from '../services/clinicAccess';
import { hasClinicalDatabaseConfiguration } from '../services/supabase';

const localDateTime = (date: Date) => {
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const currentLocalTime = () => {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5, 0, 0);
  return localDateTime(now);
};
const scheduleParts = (date: Date) => {
  const local = localDateTime(date);
  return { date: local.slice(0, 10), time: local.slice(11) };
};

type InvitePatientFormProps = { onCreated?: () => void };

export function InvitePatientForm({ onCreated }: InvitePatientFormProps) {
  const [open, setOpen] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [reason, setReason] = useState('');
  const initialSchedule = scheduleParts(new Date());
  const [appointmentDate, setAppointmentDate] = useState(initialSchedule.date);
  const [appointmentTime, setAppointmentTime] = useState(initialSchedule.time);
  const [link, setLink] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setLink(''); setEmailStatus('');
    try {
      const selectedTime = new Date(`${appointmentDate}T${appointmentTime}`);
      if (!appointmentDate || !appointmentTime || Number.isNaN(selectedTime.valueOf())) throw new Error('Choose a valid appointment date and time.');
      const invitation = await createPatientInvitation({ patientName, patientEmail, reason, startsAt: selectedTime.toISOString() });
      setLink(invitation.invitationUrl);
      setEmailStatus(invitation.emailSent ? `Appointment link sent to ${patientEmail}.` : invitation.emailWarning ?? 'Appointment link created. Share it with the patient manually.');
      onCreated?.();
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : 'Unable to create patient link.');
    } finally { setSaving(false); }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(link);
  };
  const chooseTime = (when: Date) => {
    const next = scheduleParts(when);
    setAppointmentDate(next.date); setAppointmentTime(next.time);
  };
  const soon = () => { const next = new Date(); next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5 + 30, 0, 0); chooseTime(next); };
  const tomorrowMorning = () => { const next = new Date(); next.setDate(next.getDate() + 1); next.setHours(9, 0, 0, 0); chooseTime(next); };

  if (!open) return <button className="button button-secondary" onClick={() => setOpen(true)}><Plus size={17} /> New patient link</button>;
  return <section className="invite-panel" aria-label="Create patient invitation">
    <div className="section-heading compact"><div><p className="eyebrow">Clinician action</p><h2>Invite a patient</h2></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close invitation form"><X size={18} /></button></div>
    {!hasClinicalDatabaseConfiguration ? <p className="access-warning">Set up the clinical database first. This form cannot create real patient links until protected data storage is configured.</p> : <form onSubmit={(event) => void submit(event)} className="invite-form">
      <label>Patient name<input value={patientName} onChange={(event) => setPatientName(event.target.value)} required /></label>
      <label>Patient email<input type="email" value={patientEmail} onChange={(event) => setPatientEmail(event.target.value)} required /></label>
      <label>Appointment reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Scheduled consultation" required /></label>
      <fieldset className="schedule-picker"><legend>Appointment time</legend><div className="schedule-fields"><label><CalendarDays size={16} /> Date<input type="date" value={appointmentDate} min={currentLocalTime().slice(0, 10)} onChange={(event) => setAppointmentDate(event.target.value)} required /></label><label><Clock3 size={16} /> Time<input type="time" value={appointmentTime} step="300" onChange={(event) => setAppointmentTime(event.target.value)} required /></label></div><div className="schedule-shortcuts"><button type="button" onClick={soon}>In 30 minutes</button><button type="button" onClick={tomorrowMorning}>Tomorrow, 9:00 am</button></div><small>Times are shown in your local timezone.</small></fieldset>
      <button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />}{saving ? 'Creating…' : 'Create secure link'}</button>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {link && <div className="created-link"><strong>Patient link ready</strong><span>{emailStatus} The link expires 24 hours after the appointment start time.</span><div><input value={link} readOnly aria-label="Patient invitation link" /><button className="button button-secondary button-small" onClick={() => void copy()}><Copy size={16} /> Copy</button></div></div>}
  </section>;
}
