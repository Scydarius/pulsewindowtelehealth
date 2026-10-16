import { Activity, ArrowRight, BookmarkCheck, Building2, CalendarClock, CalendarDays, Check, CheckCircle2, CircleAlert, Copy, Globe, LoaderCircle, MessageSquareText, RotateCcw, Search, ShieldOff, Stethoscope, Trash2, UsersRound, Video, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusPill } from '../components/StatusPill';
import { InvitePatientForm, type ExistingPatientOption } from '../components/InvitePatientForm';
import { ClinicianAvailabilityPanel } from '../components/ClinicianAvailabilityPanel';
import { CopyButton } from '../components/CopyButton';
import { type ClinicAppointment, type ClinicianProfile, isAppointmentNeedingReview, loadClinicianWorkspace } from '../services/clinicianData';
import { claimInitialAdministratorAccess, createReplacementPatientInvitation, deleteAppointment, deletePatient, loadClinicPatients, revokePatientInvitation, updateAppointmentReviewStatus, type DirectoryPatient } from '../services/clinicAccess';

type WorkspaceView = 'overview' | 'patients' | 'appointments' | 'measurements' | 'availability' | 'calendar';
const workspaceView = (value: string | null): WorkspaceView => value === 'patients' || value === 'appointments' || value === 'measurements' || value === 'availability' || value === 'calendar' ? value : 'overview';
const reasonSummary = (value: string) => value.split('\n\nPatient notes:')[0].trim();
const intakeNote = (value: string) => value.split('\n\nPatient notes:')[1]?.trim() ?? '';
const appointmentState = (appointment: ClinicAppointment, now = new Date()) => {
  if (isAppointmentNeedingReview(appointment)) return 'Needs review';
  if (appointment.reviewed_at) return 'Reviewed';
  const startsAt = new Date(appointment.starts_at);
  if (startsAt.valueOf() < now.valueOf()) return 'Awaiting patient';
  if (startsAt.toDateString() === now.toDateString()) return 'Today';
  return 'Scheduled';
};
const shortDate = (value: Date) => new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric' }).format(value);

type ScheduleSubTab = 'appointments' | 'calendar' | 'availability';

export function ClinicianPage() {
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view');
  const view: WorkspaceView = rawView === 'patients' || rawView === 'measurements' ? rawView : rawView === 'calendar' || rawView === 'availability' || rawView === 'appointments' ? 'appointments' : 'overview';
  const [scheduleTab, setScheduleTab] = useState<ScheduleSubTab>(() => rawView === 'calendar' ? 'calendar' : rawView === 'availability' ? 'availability' : 'appointments');
  const [profile, setProfile] = useState<ClinicianProfile>();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [directoryPatients, setDirectoryPatients] = useState<DirectoryPatient[]>([]);
  const [patientScope, setPatientScope] = useState<'clinic' | 'mine' | 'all'>('clinic');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [replacementLinks, setReplacementLinks] = useState<Record<string, string>>({});
  const [replacementEmailStatus, setReplacementEmailStatus] = useState<Record<string, string>>({});
  const [emailReplacementLink, setEmailReplacementLink] = useState<Record<string, boolean>>({});
  const [linkError, setLinkError] = useState('');
  const [creatingLink, setCreatingLink] = useState<string>();
  const [revokingLink, setRevokingLink] = useState<string>();
  const [deletingAppointment, setDeletingAppointment] = useState<string>();
  const [deletingPatient, setDeletingPatient] = useState<string>();
  const [revokedLinks, setRevokedLinks] = useState<Record<string, true>>({});
  const [claimingAccess, setClaimingAccess] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');

  // Keep sub-tab in sync if URL query changes
  useEffect(() => {
    const v = params.get('view');
    if (v === 'calendar') setScheduleTab('calendar');
    else if (v === 'availability') setScheduleTab('availability');
    else if (v === 'appointments') setScheduleTab('appointments');
  }, [params]);

  const selectScheduleTab = (tab: ScheduleSubTab) => {
    setScheduleTab(tab);
    setParams({ view: tab === 'appointments' ? 'appointments' : tab });
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [workspace, dirPatients] = await Promise.all([
        loadClinicianWorkspace(),
        loadClinicPatients(patientScope).catch(() => []),
      ]);
      setProfile(workspace.profile);
      setAppointments(workspace.appointments);
      setDirectoryPatients(dirPatients);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open the clinician workspace.'); }
    finally { setLoading(false); }
  }, [patientScope]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    loadClinicPatients(patientScope)
      .then(setDirectoryPatients)
      .catch(() => {});
  }, [patientScope]);

  useEffect(() => {
    const onReviewUpdated = (e: Event) => {
      const custom = e as CustomEvent<{ appointmentId: string; needsReview: boolean; reviewedAt: string | null }>;
      if (custom.detail) {
        setAppointments((prev) =>
          prev.map((item) =>
            item.id === custom.detail.appointmentId
              ? {
                  ...item,
                  needs_review: custom.detail.needsReview,
                  reviewed_at: custom.detail.reviewedAt,
                }
              : item
          )
        );
      }
    };
    window.addEventListener('ventricura:review-updated', onReviewUpdated);
    return () => window.removeEventListener('ventricura:review-updated', onReviewUpdated);
  }, []);

  const now = new Date();
  const scheduled = appointments.filter((appointment) => new Date(appointment.starts_at) >= now);
  const todayAppointments = appointments.filter((appointment) => new Date(appointment.starts_at).toDateString() === now.toDateString());
  const readingsToReview = appointments.filter((appointment) => isAppointmentNeedingReview(appointment));
  const reviewQueue = [...readingsToReview].sort((left, right) => {
    const leftTime = left.latestMeasurement ? new Date(left.latestMeasurement.measured_at).valueOf() : new Date(left.starts_at).valueOf();
    const rightTime = right.latestMeasurement ? new Date(right.latestMeasurement.measured_at).valueOf() : new Date(right.starts_at).valueOf();
    return rightTime - leftTime;
  });

  const handleRemoveFromReview = async (appointmentId: string) => {
    const target = appointments.find((a) => a.id === appointmentId);
    const patientName = target?.patient?.display_name || 'Patient';
    setAppointments((prev) =>
      prev.map((item) =>
        item.id === appointmentId
          ? { ...item, needs_review: false, reviewed_at: new Date().toISOString() }
          : item
      )
    );
    setNotice(`Removed ${patientName} from review queue.`);
    try {
      await updateAppointmentReviewStatus(appointmentId, false);
    } catch {
      // Saved in local cache
    }
  };

  const handleRemovePatient = async (patient: { id: string; display_name: string; email: string }) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove ${patient.display_name} (${patient.email})?\n\nThis will remove them from your active patients list and delete their associated appointment records and notes.`
    );
    if (!confirmed) return;
    setDeletingPatient(patient.id);
    setError('');
    try {
      await deletePatient(patient.id, patient.email);
      setNotice(`Removed ${patient.display_name} from active patients.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove patient.');
    } finally {
      setDeletingPatient(undefined);
    }
  };
  // Email is the patient identity used by invitations, so all visits for the
  // same email stay together even if a legacy record was duplicated.
  const patientGroups = useMemo(() => Array.from(appointments.filter((appointment) => appointment.patient?.email).reduce((groups, appointment) => {
    const email = appointment.patient!.email.trim().toLowerCase(); const current = groups.get(email) ?? []; current.push(appointment); groups.set(email, current); return groups;
  }, new Map<string, ClinicAppointment[]>()).values()).map((records) => ({ records: [...records].sort((a, b) => new Date(b.starts_at).valueOf() - new Date(a.starts_at).valueOf()), patient: records[0].patient! })), [appointments]);

  const patientOptions = useMemo<ExistingPatientOption[]>(() => {
    const map = new Map<string, ExistingPatientOption>();
    for (const dp of directoryPatients) {
      map.set(dp.email.toLowerCase().trim(), {
        id: dp.id,
        displayName: dp.displayName,
        email: dp.email,
        appointmentCount: dp.appointmentCount,
      });
    }
    for (const group of patientGroups) {
      const email = group.patient.email.toLowerCase().trim();
      if (!map.has(email)) {
        map.set(email, {
          id: group.patient.id,
          displayName: group.patient.display_name,
          email: group.patient.email,
          appointmentCount: group.records.length,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [directoryPatients, patientGroups]);

  const displayedDirectoryPatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (directoryPatients.length > 0) {
      return directoryPatients.filter((p) =>
        !term ||
        [p.displayName, p.email, p.clinicName, p.clinicianName].some((v) => v?.toLowerCase().includes(term))
      );
    }
    return patientGroups
      .filter((g) => !term || [g.patient.display_name, g.patient.email].some((v) => v.toLowerCase().includes(term)))
      .map((g) => ({
        id: g.patient.id,
        displayName: g.patient.display_name,
        email: g.patient.email,
        clinicianId: null,
        clinicianName: null,
        clinicianTitle: null,
        clinicId: null,
        clinicName: profile?.clinic_name || 'Ventricura Telehealth',
        clinicSlug: profile?.clinic_slug || 'ventricura',
        appointmentCount: g.records.length,
        latestAppointment: g.records[0]?.starts_at || new Date().toISOString(),
      }));
  }, [directoryPatients, patientGroups, search, profile]);
  const visibleAppointments = appointments.filter((appointment) => {
    const term = search.trim().toLowerCase();
    return !term || [appointment.patient?.display_name, appointment.patient?.email, appointment.reason].filter(Boolean).some((value) => value!.toLowerCase().includes(term));
  });
  const matchesPatient = (appointment: ClinicAppointment) => !search.trim() || [appointment.patient?.display_name, appointment.patient?.email].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()));

  const createReplacementLink = async (appointmentId: string) => {
    setCreatingLink(appointmentId); setLinkError('');
    try {
      const shouldSendEmail = emailReplacementLink[appointmentId] !== false;
      const result = await createReplacementPatientInvitation(appointmentId, { sendEmail: shouldSendEmail });
      setReplacementLinks((links) => ({ ...links, [appointmentId]: result.invitationUrl }));
      setReplacementEmailStatus((status) => ({ ...status, [appointmentId]: result.emailSent ? 'A new secure link has been emailed to the patient.' : result.emailWarning ?? 'A new secure link was created, but email delivery could not be confirmed.' }));
      setNotice(result.emailSent ? 'New meeting link created and emailed to the patient.' : result.emailWarning ?? 'New meeting link created.');
      setRevokedLinks((links) => { const next = { ...links }; delete next[appointmentId]; return next; });
    } catch (reason) { setLinkError(reason instanceof Error ? reason.message : 'Unable to generate a new patient link.'); }
    finally { setCreatingLink(undefined); }
  };
  const revokeLink = async (appointmentId: string) => {
    if (!window.confirm('Revoke the patient’s current access link? They will no longer be able to join this call until you generate a new link.')) return;
    setRevokingLink(appointmentId); setLinkError('');
    try {
      await revokePatientInvitation(appointmentId);
      setRevokedLinks((links) => ({ ...links, [appointmentId]: true }));
      setReplacementLinks((links) => { const next = { ...links }; delete next[appointmentId]; return next; });
      setNotice('Patient link revoked. Generate a new link when they need access again.');
    } catch (reason) { setLinkError(reason instanceof Error ? reason.message : 'Unable to revoke patient access.'); }
    finally { setRevokingLink(undefined); }
  };
  const removeAppointment = async (appointmentId: string) => {
    if (!window.confirm('Delete this appointment? Its call link, private notes, and saved measurement data will be removed. The patient record will be kept.')) return;
    setDeletingAppointment(appointmentId); setLinkError('');
    try { await deleteAppointment(appointmentId); await load(); }
    catch (reason) { setLinkError(reason instanceof Error ? reason.message : 'Unable to remove the appointment.'); }
    finally { setDeletingAppointment(undefined); }
  };
  const claimAccess = async () => {
    setClaimingAccess(true); setError('');
    try { await claimInitialAdministratorAccess(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete administrator setup.'); }
    finally { setClaimingAccess(false); }
  };

  if (loading && !profile) return <div className="workspace-state"><LoaderCircle className="spin" /><strong>Loading your clinical workspace…</strong></div>;
  if (error) return <div className="workspace-state"><CircleAlert /><strong>Access required</strong><span>{error}</span>{error === 'This account is not an authorised clinician.' ? <button className="button button-primary" onClick={() => void claimAccess()} disabled={claimingAccess}>{claimingAccess ? <LoaderCircle className="spin" size={18} /> : null}{claimingAccess ? 'Completing setup…' : 'Complete administrator setup'}</button> : <Link className="button button-primary" to="/clinician/sign-in">Sign in</Link>}</div>;

  const appointmentRow = (appointment: ClinicAppointment) => {
    const patientEmail = appointment.patient?.email ?? '';
    const patientId = appointment.patient?.id ?? '';
    const note = intakeNote(appointment.reason);
    const accessState = revokedLinks[appointment.id] ? 'Access revoked' : replacementLinks[appointment.id] ? 'New link ready' : 'Link active';
    return <article className="appointment-row clinician-record-row" key={appointment.id}>
      <div className="patient-avatar">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
      <div className="record-person"><Link className="patient-profile-link" to={`/clinician/patient?id=${encodeURIComponent(patientId)}`}>{appointment.patient?.display_name ?? 'Patient'}</Link><span>{reasonSummary(appointment.reason) || 'Consultation'}</span><small>{patientEmail}</small></div>
      <div className="record-time"><strong>{new Date(appointment.starts_at).toLocaleString()}</strong><span>{new Date(appointment.starts_at) <= new Date() ? 'Available to open' : 'Scheduled appointment'}</span></div>
      <StatusPill tone={revokedLinks[appointment.id] ? 'neutral' : new Date(appointment.starts_at) <= new Date() ? 'active' : 'neutral'}>{accessState}</StatusPill>
      <div className="appointment-actions">
        <Link className="button button-primary button-small" to={`/consultation/${appointment.id}?role=clinician${appointment.patient?.display_name ? `&patientName=${encodeURIComponent(appointment.patient.display_name)}` : ''}${profile?.display_name ? `&clinicianName=${encodeURIComponent(profile.display_name)}` : ''}`}><Video size={17} /> Join call</Link>
        <Link className="text-button" to={`/clinician/patient?id=${encodeURIComponent(patientId)}`}>Profile</Link>
        <label className="meeting-link-email-choice"><input type="checkbox" checked={emailReplacementLink[appointment.id] !== false} onChange={(event) => setEmailReplacementLink((current) => ({ ...current, [appointment.id]: event.target.checked }))} /> Email new link to patient</label>
        <button className="text-button" onClick={() => void createReplacementLink(appointment.id)} disabled={creatingLink === appointment.id}>{creatingLink === appointment.id ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}{replacementLinks[appointment.id] ? 'Regenerate meeting again' : 'Regenerate meeting link'}</button>
        <button className="text-button danger-action" onClick={() => void revokeLink(appointment.id)} disabled={revokingLink === appointment.id || Boolean(revokedLinks[appointment.id])}>{revokingLink === appointment.id ? <LoaderCircle className="spin" size={16} /> : <ShieldOff size={16} />}{revokedLinks[appointment.id] ? 'Access revoked' : 'Revoke access'}</button>
        <button className="text-button danger-action" onClick={() => void removeAppointment(appointment.id)} disabled={deletingAppointment === appointment.id}>{deletingAppointment === appointment.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}Delete appointment</button>
      </div>
      {note && <aside className="appointment-intake-note"><div><MessageSquareText size={16} /><span>Patient intake note</span></div><p>{note}</p></aside>}
      {replacementLinks[appointment.id] && <div className="appointment-link"><span>New patient link created. The old link has been revoked. {replacementEmailStatus[appointment.id]}</span><input value={replacementLinks[appointment.id]} readOnly aria-label="Replacement patient invitation link" /><CopyButton text={replacementLinks[appointment.id]} label="Copy link" copiedLabel="Link copied!" className="button button-secondary button-small" /></div>}
    </article>;
  };
  const commandAppointmentRow = (appointment: ClinicAppointment) => <article key={appointment.id} className="command-appointment command-appointment-with-access"><div className="command-time"><strong>{new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(appointment.starts_at))}</strong><span>{shortDate(new Date(appointment.starts_at))}</span></div><div><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{reasonSummary(appointment.reason) || 'Consultation'}</span></div><span className={`appointment-state state-${appointmentState(appointment).toLowerCase().replaceAll(' ', '-')}`}>{appointmentState(appointment)}</span><div className="command-appointment-actions"><Link className="button button-primary button-small" to={`/consultation/${appointment.id}?role=clinician${appointment.patient?.display_name ? `&patientName=${encodeURIComponent(appointment.patient.display_name)}` : ''}${profile?.display_name ? `&clinicianName=${encodeURIComponent(profile.display_name)}` : ''}`}><Video size={15} /> Join</Link><label className="meeting-link-email-choice"><input type="checkbox" checked={emailReplacementLink[appointment.id] !== false} onChange={(event) => setEmailReplacementLink((current) => ({ ...current, [appointment.id]: event.target.checked }))} /> Email patient</label><button className="text-button command-regenerate-link" onClick={() => void createReplacementLink(appointment.id)} disabled={creatingLink === appointment.id}>{creatingLink === appointment.id ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />}{replacementLinks[appointment.id] ? 'Regenerate again' : 'Regenerate link'}</button></div>{replacementLinks[appointment.id] && <div className="command-new-link"><span>{replacementEmailStatus[appointment.id]}</span><CopyButton text={replacementLinks[appointment.id]} label="Copy patient link" copiedLabel="Link copied" className="text-button" /></div>}</article>;
  const title = view === 'patients' ? ['Patients', 'Active patients and their longitudinal records'] : view === 'appointments' ? ['Schedule & Bookings', 'Manage appointments, seven-day calendar, and patient self-booking availability.'] : view === 'measurements' ? ['Review queue', 'Readings received from patient sessions'] : ['Today', 'Your appointments, follow-up work, and patient activity in one place.'];

  return <div className="dashboard-page">
    <section className="page-intro clinician-intro"><div><p className="eyebrow">Clinician workspace / {view === 'appointments' ? 'Schedule' : view}</p><h1>{title[0]}</h1><p>Welcome, {profile?.display_name}. {title[1]}</p></div><div className="workspace-actions"><label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search patients and appointments" placeholder="Search name, email, or reason…" />{search && <button type="button" className="text-button" onClick={() => setSearch('')} aria-label="Clear search" style={{ padding: 0, margin: 0, border: 0, background: 'none' }}><X size={15} /></button>}</label></div></section>
    <section className="summary-strip workspace-summary">
      <Link to="/clinician?view=appointments"><div><CalendarClock /></div><span><strong>{todayAppointments.length}</strong>Appointments today</span><ArrowRight size={16} /></Link>
      <Link to="/clinician?view=patients"><div><UsersRound /></div><span><strong>{directoryPatients.length || patientGroups.length}</strong>Active patients</span><ArrowRight size={16} /></Link>
      <Link to="/clinician?view=measurements"><div><Activity /></div><span><strong>{reviewQueue.length}</strong>Needs review</span><ArrowRight size={16} /></Link>
      <Link to="/clinician?view=calendar"><div><CalendarDays /></div><span><strong>{scheduled.length}</strong>Upcoming calls</span><ArrowRight size={16} /></Link>
    </section>

    {view === 'overview' && <><section className="command-centre"><div className="command-centre-main"><div className="section-heading"><div><p className="eyebrow">Today / schedule</p><h2>Your next appointments</h2><p>Join a call, check the patient record, or manage access without leaving this view.</p></div><button className="text-button" onClick={() => selectScheduleTab('calendar')}>Open calendar <ArrowRight size={16} /></button></div><div className="command-list">{scheduled.slice(0, 3).map(commandAppointmentRow)}{scheduled.length === 0 && <EmptyAppointments />}</div></div><aside className="command-centre-action"><p className="eyebrow">Quick action</p><h2>Create an appointment</h2><p>Add a new patient or schedule a follow-up for an existing patient.</p><InvitePatientForm patients={patientOptions} onCreated={() => void load()} triggerVariant="primary" /></aside></section><section className="panel review-queue-panel"><div className="section-heading"><div><p className="eyebrow">Review queue</p><h2>Patient readings ready</h2><p>Open the session record, review measurements, and document follow-up.</p></div><Link className="text-button" to="/clinician?view=measurements">View all <ArrowRight size={16} /></Link></div><MeasurementList appointments={reviewQueue.slice(0, 4)} onRemoveFromReview={handleRemoveFromReview} /></section></>}
    {view === 'patients' && (
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Patient directory</p>
            <h2>Active patients</h2>
            <p>Unified patient profiles accessible across doctors and clinic practices.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div className="patient-scope-selector" style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '4px', gap: '3px' }}>
              <button
                type="button"
                className={`patient-scope-btn ${patientScope === 'clinic' ? 'active' : ''}`}
                onClick={() => setPatientScope('clinic')}
                style={{
                  border: 'none',
                  background: patientScope === 'clinic' ? '#ffffff' : 'transparent',
                  fontWeight: patientScope === 'clinic' ? 700 : 500,
                  fontSize: '0.78rem',
                  padding: '5px 11px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  boxShadow: patientScope === 'clinic' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  color: patientScope === 'clinic' ? '#0f172a' : '#64748b',
                }}
              >
                <Building2 size={13} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px' }} />
                Clinic patients
              </button>
              <button
                type="button"
                className={`patient-scope-btn ${patientScope === 'mine' ? 'active' : ''}`}
                onClick={() => setPatientScope('mine')}
                style={{
                  border: 'none',
                  background: patientScope === 'mine' ? '#ffffff' : 'transparent',
                  fontWeight: patientScope === 'mine' ? 700 : 500,
                  fontSize: '0.78rem',
                  padding: '5px 11px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  boxShadow: patientScope === 'mine' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  color: patientScope === 'mine' ? '#0f172a' : '#64748b',
                }}
              >
                <Stethoscope size={13} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px' }} />
                My patients
              </button>
              <button
                type="button"
                className={`patient-scope-btn ${patientScope === 'all' ? 'active' : ''}`}
                onClick={() => setPatientScope('all')}
                style={{
                  border: 'none',
                  background: patientScope === 'all' ? '#ffffff' : 'transparent',
                  fontWeight: patientScope === 'all' ? 700 : 500,
                  fontSize: '0.78rem',
                  padding: '5px 11px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  boxShadow: patientScope === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  color: patientScope === 'all' ? '#0f172a' : '#64748b',
                }}
              >
                <Globe size={13} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px' }} />
                All clinics
              </button>
            </div>
            <InvitePatientForm patients={patientOptions} onCreated={() => void load()} />
          </div>
        </div>
        <div className="patient-directory">
          {displayedDirectoryPatients.map((p) => (
            <article key={p.email} className="patient-directory-card patient-directory-card-grouped">
              <div className="patient-avatar">
                {p.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <strong>{p.displayName}</strong>
                  {p.clinicName && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 650, color: '#0369a1', background: '#e0f2fe', padding: '1px 6px', borderRadius: '3px' }}>
                      {p.clinicName}
                    </span>
                  )}
                  {p.clinicianName && (
                    <span style={{ fontSize: '0.7rem', color: '#475569', background: '#f1f5f9', padding: '1px 6px', borderRadius: '3px' }}>
                      Dr. {p.clinicianName.replace(/^Dr\.?\s*/i, '')}
                    </span>
                  )}
                </div>
                <span>{p.email}</span>
                <small>
                  {p.appointmentCount} consultation{p.appointmentCount === 1 ? '' : 's'} · latest {new Date(p.latestAppointment).toLocaleDateString()}
                </small>
              </div>
              <div className="patient-directory-actions">
                <Link className="button button-secondary button-small" to={`/clinician/patient?id=${encodeURIComponent(p.id)}`}>
                  Open profile <ArrowRight size={15} />
                </Link>
                <button
                  type="button"
                  className="text-button danger-action patient-remove-btn"
                  disabled={deletingPatient === p.id}
                  onClick={() => void handleRemovePatient({ id: p.id, display_name: p.displayName, email: p.email })}
                  title="Remove patient from active list"
                >
                  {deletingPatient === p.id ? <LoaderCircle size={13} className="spin" /> : <Trash2 size={13} />} Remove
                </button>
              </div>
            </article>
          ))}
          {displayedDirectoryPatients.length === 0 && <EmptyAppointments />}
        </div>
      </section>
    )}
    {view === 'appointments' && <div className="schedule-unified-container">
      <nav className="schedule-tab-nav" aria-label="Schedule views">
        <button className={scheduleTab === 'appointments' ? 'active' : ''} onClick={() => selectScheduleTab('appointments')}>
          <CalendarClock size={16} /> All appointments ({visibleAppointments.length})
        </button>
        <button className={scheduleTab === 'calendar' ? 'active' : ''} onClick={() => selectScheduleTab('calendar')}>
          <CalendarDays size={16} /> 7-Day calendar
        </button>
        <button className={scheduleTab === 'availability' ? 'active' : ''} onClick={() => selectScheduleTab('availability')}>
          <Activity size={16} /> Booking availability & sync
        </button>
      </nav>

      {scheduleTab === 'appointments' && <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Schedule and access</p>
            <h2>All appointments</h2>
            <p>Join any appointment directly, then manage its secure patient link from the same record.</p>
          </div>
          <InvitePatientForm patients={patientOptions} onCreated={() => void load()} />
        </div>
        <div className="appointment-table">
          {visibleAppointments.map(appointmentRow)}
          {visibleAppointments.length === 0 && <EmptyAppointments />}
        </div>
      </section>}

      {scheduleTab === 'calendar' && <CalendarWeek appointments={appointments} onEditAvailability={() => selectScheduleTab('availability')} />}

      {scheduleTab === 'availability' && <ClinicianAvailabilityPanel />}
    </div>}
    {view === 'measurements' && <section className="panel"><div className="section-heading"><div><p className="eyebrow">Measurement record</p><h2>Readings to review</h2><p>Open the patient call to review live signal context, saved data and private notes.</p></div></div><MeasurementList appointments={readingsToReview.filter(matchesPatient)} onRemoveFromReview={handleRemoveFromReview} /></section>}
    {notice && <div className="workspace-toast"><CheckCircle2 size={17} /> {notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}{linkError && <p className="form-error">{linkError}</p>}
  </div>;
}

function EmptyAppointments() { return <div className="empty-records"><UsersRound /><strong>No appointments to show</strong><span>Create a secure patient link to add a patient and appointment.</span></div>; }
function MeasurementList({ appointments, onRemoveFromReview }: { appointments: ClinicAppointment[]; onRemoveFromReview?: (appointmentId: string) => void }) {
  if (!appointments.length) return <div className="empty-records compact-empty"><Activity /><strong>No patients needing review</strong><span>Patients flagged during consultations or with completed camera checks will appear here for review.</span></div>;
  return <div className="measurement-review-list">{appointments.map((appointment) => {
    const reading = appointment.latestMeasurement;
    return <div className="review-card" key={appointment.id}>
      <div className="patient-avatar alert">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
      <div className="review-patient">
        <strong>{appointment.patient?.display_name ?? 'Patient'}</strong>
        <span>{reading ? `Captured ${new Date(reading.measured_at).toLocaleString()}` : `Flagged during consultation · ${new Date(appointment.starts_at).toLocaleDateString()}`}</span>
      </div>
      <div className="review-reading-summary">
        {reading ? (
          <>
            <span><strong>{Math.round(reading.heart_rate_bpm)}</strong> BPM</span>
            <span><strong>{Math.round(reading.respiratory_rate_bpm)}</strong> breaths/min</span>
            <span><strong>{Math.round(reading.signal_quality <= 1 ? reading.signal_quality * 100 : reading.signal_quality)}%</strong> quality</span>
          </>
        ) : (
          <span className="flagged-consult-badge"><BookmarkCheck size={13} /> Flagged for review</span>
        )}
      </div>
      <span className="appointment-state state-ready-for-review">Needs review</span>
      <div className="review-card-actions">
        <Link className="review-record-action" to={`/clinician/review?appointment=${encodeURIComponent(appointment.id)}&patient=${encodeURIComponent(appointment.patient?.id ?? '')}`}>Review <ArrowRight size={15} /></Link>
        {onRemoveFromReview && (
          <button type="button" className="review-dismiss-action text-button" onClick={() => onRemoveFromReview(appointment.id)} title="Remove from review queue">
            <Check size={14} /> Remove
          </button>
        )}
      </div>
    </div>;
  })}</div>;
}

function CalendarWeek({ appointments, onEditAvailability }: { appointments: ClinicAppointment[]; onEditAvailability?: () => void }) {
  const days = Array.from({ length: 7 }, (_, offset) => { const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + offset); return day; });
  return <section className="panel calendar-week-panel"><div className="section-heading"><div><p className="eyebrow">Next seven days</p><h2>Your schedule</h2><p>Select an appointment to open its patient record or join the consultation.</p></div>{onEditAvailability ? <button type="button" className="button button-secondary button-small" onClick={onEditAvailability}>Edit availability</button> : <Link className="button button-secondary button-small" to="/clinician?view=availability">Edit availability</Link>}</div><div className="calendar-week-grid">{days.map((day) => { const entries = appointments.filter((appointment) => new Date(appointment.starts_at).toDateString() === day.toDateString()); return <section key={day.toISOString()} className="calendar-day"><header><span>{new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(day)}</span><strong>{day.getDate()}</strong></header>{entries.length ? entries.map((appointment) => <Link key={appointment.id} to={`/clinician/patient?id=${encodeURIComponent(appointment.patient?.id ?? '')}`} className="calendar-entry"><time>{new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(appointment.starts_at))}</time><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{reasonSummary(appointment.reason) || 'Consultation'}</span></Link>) : <span className="calendar-empty">No appointments</span>}</section>; })}</div></section>;
}
