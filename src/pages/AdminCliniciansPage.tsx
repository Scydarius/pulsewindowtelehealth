import { ArrowLeft, Building2, CircleAlert, KeyRound, LoaderCircle, Save, ShieldCheck, Trash2, UserCog, UserPlus, UsersRound } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getClinicianAccessToken } from '../services/clinicAccess';

type Clinic = { id: string; name: string; slug: string; public_domain: string | null; website_headline?: string | null; website_intro?: string | null; website_about?: string | null; website_phone?: string | null; website_email?: string | null; website_enabled?: boolean };
type Clinician = { id: string; display_name: string; email: string; is_admin: boolean; is_platform_admin?: boolean; clinic_id: string | null; created_at: string };
type AdminPatient = { id: string; display_name: string; email: string; created_at: string; appointment_count: number; latest_appointment_at: string | null; clinician: { display_name: string } | null };
type Action = 'update' | 'reset_password';

export function AdminCliniciansPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicSlug, setClinicSlug] = useState('');
  const [publicDomain, setPublicDomain] = useState('');
  const [editingClinic, setEditingClinic] = useState<string | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
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
      const body = await response.json() as { clinicians?: Clinician[]; patients?: AdminPatient[]; clinics?: Clinic[]; currentClinicId?: string | null; isPlatformAdmin?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to load clinicians.');
      setClinicians(body.clinicians ?? []);
      setPatients(body.patients ?? []);
      setClinics(body.clinics ?? []); setIsPlatformAdmin(body.isPlatformAdmin === true); setClinicId((current) => current || body.currentClinicId || body.clinics?.[0]?.id || '');
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
    try { setMessage(await request('POST', { displayName, email, clinicId })); setDisplayName(''); setEmail(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add clinician.'); }
    finally { setSaving(false); }
  };
  const manage = async (clinician: Clinician, action: Action) => {
    setWorkingId(`${clinician.id}:${action}`); setError(''); setMessage('');
    try { setMessage(await request('PATCH', { action, clinicianId: clinician.id, displayName: clinician.display_name, isAdmin: clinician.is_admin, clinicId: clinician.clinic_id })); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update clinician.'); }
    finally { setWorkingId(''); }
  };
  const createClinic = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { setMessage(await request('PATCH', { action: 'create_clinic', clinicName, clinicSlug, publicDomain })); setClinicName(''); setClinicSlug(''); setPublicDomain(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create clinic.'); }
    finally { setSaving(false); }
  };
  const updateClinic = async (event: FormEvent, clinic: Clinic) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { setMessage(await request('PATCH', { action: 'update_clinic', clinicId: clinic.id, clinicName: clinic.name, clinicSlug: clinic.slug, publicDomain: clinic.public_domain, websiteHeadline: clinic.website_headline, websiteIntro: clinic.website_intro, websiteAbout: clinic.website_about, websitePhone: clinic.website_phone, websiteEmail: clinic.website_email, websiteEnabled: clinic.website_enabled !== false })); setEditingClinic(null); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update clinic website.'); }
    finally { setSaving(false); }
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
      <form onSubmit={(event) => void submit(event)} className="access-form admin-add-form"><label>Clinician name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Dr Taylor Morgan" required /></label><label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@clinic.com" required /></label>{isPlatformAdmin && <label>Clinic<select value={clinicId} onChange={(event) => setClinicId(event.target.value)} required><option value="">Choose clinic</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></label>}<button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <UserPlus size={18} />}{saving ? 'Sending…' : 'Add clinician'}</button></form>
      {message && <p className="access-message">{message}</p>}{error && <p className="form-error"><CircleAlert size={16} /> {error}</p>}
    </section>
    {isPlatformAdmin && <section className="admin-card"><div className="section-heading"><div><p className="eyebrow">Ventricura platform</p><h2>Medical centres & websites</h2><p>Create a clinic, then give it its own public page at <strong>clinic-name.ventricura.com</strong>.</p></div><Building2 size={24} /></div><form className="access-form admin-add-form" onSubmit={(event) => void createClinic(event)}><label>Clinic name<input value={clinicName} onChange={(event) => setClinicName(event.target.value)} placeholder="Grove Way Medical" required /></label><label>URL label<input value={clinicSlug} onChange={(event) => setClinicSlug(event.target.value)} placeholder="grovewaymedical" /></label><label>Optional clinic-owned domain<input value={publicDomain} onChange={(event) => setPublicDomain(event.target.value)} placeholder="ventricura.grovewaymedical.com" /></label><button className="button button-primary" disabled={saving}><Building2 size={18} /> Add medical centre</button></form><div className="clinic-site-list">{clinics.map((clinic) => <article key={clinic.id} className="clinic-site-admin"><div><strong>{clinic.name}</strong><span>{clinic.public_domain || `${clinic.slug}.ventricura.com`}</span></div><button type="button" className="text-button" onClick={() => setEditingClinic(editingClinic === clinic.id ? null : clinic.id)}>{editingClinic === clinic.id ? 'Close editor' : 'Edit website'}</button>{editingClinic === clinic.id && <form onSubmit={(event) => void updateClinic(event, clinic)} className="clinic-site-form"><label>Clinic name<input value={clinic.name} onChange={(event) => setClinics((items) => items.map((item) => item.id === clinic.id ? { ...item, name: event.target.value } : item))} /></label><label>URL label<input value={clinic.slug} onChange={(event) => setClinics((items) => items.map((item) => item.id === clinic.id ? { ...item, slug: event.target.value } : item))} /></label><label>Homepage headline<input value={clinic.website_headline ?? ''} onChange={(event) => setClinics((items) => items.map((item) => item.id === clinic.id ? { ...item, website_headline: event.target.value } : item))} placeholder="Local care, online." /></label><label>Intro<textarea value={clinic.website_intro ?? ''} onChange={(event) => setClinics((items) => items.map((item) => item.id === clinic.id ? { ...item, website_intro: event.target.value } : item))} /></label><label>About the clinic<textarea value={clinic.website_about ?? ''} onChange={(event) => setClinics((items) => items.map((item) => item.id === clinic.id ? { ...item, website_about: event.target.value } : item))} /></label><label>Phone<input value={clinic.website_phone ?? ''} onChange={(event) => setClinics((items) => items.map((item) => item.id === clinic.id ? { ...item, website_phone: event.target.value } : item))} /></label><label>Email<input type="email" value={clinic.website_email ?? ''} onChange={(event) => setClinics((items) => items.map((item) => item.id === clinic.id ? { ...item, website_email: event.target.value } : item))} /></label><label className="admin-toggle"><input type="checkbox" checked={clinic.website_enabled !== false} onChange={(event) => setClinics((items) => items.map((item) => item.id === clinic.id ? { ...item, website_enabled: event.target.checked } : item))} /><span>Public website live</span></label><button className="button button-primary" disabled={saving}><Save size={16} /> Save clinic website</button></form>}</article>)}</div></section>}
    <section className="admin-card clinician-roster"><div className="section-heading"><div><p className="eyebrow">Team</p><h2>Clinicians</h2></div><span>{clinicians.length} account{clinicians.length === 1 ? '' : 's'}</span></div>
      {clinicians.length === 0 ? <p className="empty-admin">No clinician accounts yet.</p> : <div className="clinician-list">{clinicians.map((clinician) => <article className="clinician-admin-row" key={clinician.id}><div className="clinician-admin-identity"><div className="patient-avatar"><UserCog size={18} /></div><div><strong>{clinician.email || 'Account email unavailable'}</strong><span>{clinician.is_platform_admin ? 'Ventricura platform admin' : `Created ${new Date(clinician.created_at).toLocaleDateString()}`}</span></div></div><label className="admin-name-field">Name<input value={clinician.display_name} onChange={(event) => updateLocal(clinician.id, { display_name: event.target.value })} /></label>{isPlatformAdmin && <label className="admin-name-field">Clinic<select value={clinician.clinic_id ?? ''} onChange={(event) => updateLocal(clinician.id, { clinic_id: event.target.value })}>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></label>}<label className="admin-toggle"><input type="checkbox" checked={clinician.is_admin} onChange={(event) => updateLocal(clinician.id, { is_admin: event.target.checked })} /><span><ShieldCheck size={16} /> Clinic administrator</span></label><div className="clinician-admin-actions"><button className="button button-secondary button-small" onClick={() => void manage(clinician, 'update')} disabled={Boolean(workingId)}>{workingId === `${clinician.id}:update` ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Save</button><button className="text-button" onClick={() => void manage(clinician, 'reset_password')} disabled={Boolean(workingId)}>{workingId === `${clinician.id}:reset_password` ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}Send password reset</button></div></article>)}</div>}
    </section>
    <section className="admin-card clinician-roster patient-admin-roster"><div className="section-heading"><div><p className="eyebrow">Patient records</p><h2>All patients</h2><p>Administrators can review all patient records across the clinic. Deleting a patient removes their appointments, private notes, invitations, and saved research measurements.</p></div><span>{patients.length} patient{patients.length === 1 ? '' : 's'}</span></div>
      {patients.length === 0 ? <p className="empty-admin">No patient records yet.</p> : <div className="clinician-list">{patients.map((patient) => <article className="clinician-admin-row admin-patient-row" key={patient.id}><div className="clinician-admin-identity"><div className="patient-avatar"><UsersRound size={18} /></div><div><strong>{patient.display_name}</strong><span>{patient.email}</span></div></div><div className="patient-admin-meta"><strong>{patient.appointment_count}</strong><span>appointment{patient.appointment_count === 1 ? '' : 's'}</span></div><div className="patient-admin-meta"><strong>{patient.latest_appointment_at ? new Date(patient.latest_appointment_at).toLocaleDateString() : '—'}</strong><span>latest appointment</span></div><div className="patient-admin-meta"><strong>{patient.clinician?.display_name ?? 'Unknown'}</strong><span>assigned clinician</span></div><button className="text-button danger-action" onClick={() => void deletePatient(patient)} disabled={Boolean(workingId)}>{workingId === `patient:${patient.id}` ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}Delete patient</button></article>)}</div>}
    </section>
  </div>;
}
