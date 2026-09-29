import { ArrowLeft, CircleAlert, KeyRound, LoaderCircle, Save, ShieldCheck, Trash2, UserCog, UserPlus, UsersRound, Wrench } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getClinicianAccessToken } from '../services/clinicAccess';

type Clinician = { id: string; display_name: string; email: string; is_admin: boolean; created_at: string };
type AdminPatient = { id: string; display_name: string; email: string; created_at: string; appointment_count: number; latest_appointment_at: string | null; clinician: { display_name: string } | null };
type Action = 'update' | 'reset_password' | 'repair';

export function AdminCliniciansPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const load = useCallback(async () => {
    try {
      const token = await getClinicianAccessToken();
      const response = await fetch('/api/admin-clinicians', { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json() as { clinicians?: Clinician[]; patients?: AdminPatient[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to load clinicians.');
      setClinicians(body.clinicians ?? []);
      setPatients(body.patients ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load clinicians.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const request = async (method: 'POST' | 'PATCH', payload: object) => {
    const token = await getClinicianAccessToken();
    const response = await fetch('/api/admin-clinicians', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({ error: 'The clinician administration service is unavailable.' })) as { message?: string; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Unable to update clinician access.');
    return body.message ?? 'Saved.';
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { setMessage(await request('POST', { displayName, email })); setDisplayName(''); setEmail(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add clinician.'); }
    finally { setSaving(false); }
  };
  const manage = async (clinician: Clinician, action: Action) => {
    if (action === 'repair' && !window.confirm(`Repair ${clinician.email}? This removes their unused login and sends a fresh activation email.`)) return;
    setWorkingId(`${clinician.id}:${action}`); setError(''); setMessage('');
    try { setMessage(await request('PATCH', { action, clinicianId: clinician.id, displayName: clinician.display_name, isAdmin: clinician.is_admin })); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update clinician.'); }
    finally { setWorkingId(''); }
  };
  const updateLocal = (id: string, patch: Partial<Clinician>) => setClinicians((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const deletePatient = async (patient: AdminPatient) => {
    if (!window.confirm(`Permanently delete ${patient.display_name} and all ${patient.appointment_count} linked appointment record${patient.appointment_count === 1 ? '' : 's'}? This also removes saved measurements and cannot be undone.`)) return;
    setWorkingId(`patient:${patient.id}`); setError(''); setMessage('');
    try {
      const token = await getClinicianAccessToken();
      const response = await fetch('/api/admin-clinicians', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ patientId: patient.id }) });
      const body = await response.json().catch(() => ({ error: 'Unable to remove patient.' })) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to remove patient.');
      setMessage(body.message ?? 'Patient removed.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to remove patient.'); }
    finally { setWorkingId(''); }
  };

  return <div className="admin-page admin-page-wide">
    <Link to="/clinician" className="back-link"><ArrowLeft size={18} /> Back to clinician workspace</Link>
    <section className="admin-card"><p className="eyebrow">Administrator portal</p><h1>Clinic administration</h1><p>Manage clinician workspaces, account recovery, and patient records. Passwords are never visible or set by administrators—send a secure reset link instead.</p>
      <form onSubmit={(event) => void submit(event)} className="access-form admin-add-form"><label>Clinician name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Dr Taylor Morgan" required /></label><label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@clinic.com" required /></label><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <UserPlus size={18} />}{saving ? 'Sending…' : 'Add clinician'}</button></form>
      {message && <p className="access-message">{message}</p>}{error && <p className="form-error"><CircleAlert size={16} /> {error}</p>}
    </section>
    <section className="admin-card clinician-roster"><div className="section-heading"><div><p className="eyebrow">Team</p><h2>Clinicians</h2></div><span>{clinicians.length} account{clinicians.length === 1 ? '' : 's'}</span></div>
      {clinicians.length === 0 ? <p className="empty-admin">No clinician accounts yet.</p> : <div className="clinician-list">{clinicians.map((clinician) => <article className="clinician-admin-row" key={clinician.id}><div className="clinician-admin-identity"><div className="patient-avatar"><UserCog size={18} /></div><div><strong>{clinician.email || 'Account email unavailable'}</strong><span>Created {new Date(clinician.created_at).toLocaleDateString()}</span></div></div><label className="admin-name-field">Name<input value={clinician.display_name} onChange={(event) => updateLocal(clinician.id, { display_name: event.target.value })} /></label><label className="admin-toggle"><input type="checkbox" checked={clinician.is_admin} onChange={(event) => updateLocal(clinician.id, { is_admin: event.target.checked })} /><span><ShieldCheck size={16} /> Administrator</span></label><div className="clinician-admin-actions"><button className="button button-secondary button-small" onClick={() => void manage(clinician, 'update')} disabled={Boolean(workingId)}>{workingId === `${clinician.id}:update` ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Save</button><button className="text-button" onClick={() => void manage(clinician, 'reset_password')} disabled={Boolean(workingId)}>{workingId === `${clinician.id}:reset_password` ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}Send password reset</button><button className="text-button repair-button" onClick={() => void manage(clinician, 'repair')} disabled={Boolean(workingId)}>{workingId === `${clinician.id}:repair` ? <LoaderCircle className="spin" size={15} /> : <Wrench size={15} />}Repair account</button></div></article>)}</div>}
    </section>
    <section className="admin-card clinician-roster patient-admin-roster"><div className="section-heading"><div><p className="eyebrow">Patient records</p><h2>All patients</h2><p>Administrators can review all patient records across the clinic. Deleting a patient removes their appointments, private notes, invitations, and saved research measurements.</p></div><span>{patients.length} patient{patients.length === 1 ? '' : 's'}</span></div>
      {patients.length === 0 ? <p className="empty-admin">No patient records yet.</p> : <div className="clinician-list">{patients.map((patient) => <article className="clinician-admin-row admin-patient-row" key={patient.id}><div className="clinician-admin-identity"><div className="patient-avatar"><UsersRound size={18} /></div><div><strong>{patient.display_name}</strong><span>{patient.email}</span></div></div><div className="patient-admin-meta"><strong>{patient.appointment_count}</strong><span>appointment{patient.appointment_count === 1 ? '' : 's'}</span></div><div className="patient-admin-meta"><strong>{patient.latest_appointment_at ? new Date(patient.latest_appointment_at).toLocaleDateString() : '—'}</strong><span>latest appointment</span></div><div className="patient-admin-meta"><strong>{patient.clinician?.display_name ?? 'Unknown'}</strong><span>assigned clinician</span></div><button className="text-button danger-action" onClick={() => void deletePatient(patient)} disabled={Boolean(workingId)}>{workingId === `patient:${patient.id}` ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}Delete patient</button></article>)}</div>}
    </section>
  </div>;
}
