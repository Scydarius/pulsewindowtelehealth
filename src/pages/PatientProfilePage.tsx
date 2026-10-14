import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Pill,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
  Video,
  X,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  deletePatient,
  deletePatientMedication,
  loadPatientMedications,
  loadPatientProfile,
  prescribePatientMedication,
  type PatientMedication,
  type PatientProfile,
  updatePatientMedication,
} from '../services/clinicAccess';
import { searchArtgMedications, type ArtgMedication } from '../utils/artgMedications';

const number = (value: number | null, digits = 0) => (value === null ? '—' : value.toFixed(digits));
const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
const appointmentDetail = (value: string) => ({
  reason: value.split('\n\nPatient notes:')[0].trim(),
  note: value.split('\n\nPatient notes:')[1]?.trim() ?? '',
});

const FREQUENCY_PRESETS = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Four times daily',
  'At night (nocte)',
  'In the morning (mane)',
  'As needed (PRN)',
  'Weekly',
  'With meals',
];

const CEASE_REASONS = [
  'Course completed',
  'Adverse effect / intolerance',
  'Ineffective / lack of response',
  'Switched to alternative therapy',
  'No longer indicated',
  'Patient discontinued',
];

function PatientTrend({ patient }: { patient: PatientProfile }) {
  const points = patient.appointments
    .map((appointment) => ({ date: appointment.starts_at, value: appointment.measurements.at(-1)?.heart_rate_bpm }))
    .filter((item): item is { date: string; value: number } => typeof item.value === 'number' && Number.isFinite(item.value))
    .sort((left, right) => new Date(left.date).valueOf() - new Date(right.date).valueOf());
  if (points.length < 2) return null;
  const min = Math.min(...points.map((point) => point.value)) - 2;
  const max = Math.max(...points.map((point) => point.value)) + 2;
  const range = Math.max(1, max - min);
  const line = points
    .map((point, index) => `${(index / (points.length - 1)) * 100},${42 - ((point.value - min) / range) * 34}`)
    .join(' ');
  return (
    <section className="patient-cross-session-trend">
      <div>
        <p className="eyebrow">Across appointments</p>
        <h2>Pulse trend</h2>
        <span>{points.length} completed sessions</span>
      </div>
      <div className="cross-session-chart">
        <span>{Math.round(max)} BPM</span>
        <svg viewBox="0 0 100 46" preserveAspectRatio="none" role="img" aria-label="Pulse trend across completed appointments">
          <polyline points={line} />
        </svg>
        <span>{Math.round(min)} BPM</span>
      </div>
      <div className="cross-session-axis">
        <span>{new Date(points[0].date).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}</span>
        <span>Latest appointment</span>
      </div>
    </section>
  );
}

export function PatientProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('id') ?? '';
  const [patient, setPatient] = useState<PatientProfile>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Medications state
  const [medications, setMedications] = useState<PatientMedication[]>([]);
  const [showPrescribeModal, setShowPrescribeModal] = useState(false);
  const [copiedMedications, setCopiedMedications] = useState(false);
  const [medicationsFilter, setMedicationsFilter] = useState<'all' | 'active' | 'ceased'>('active');

  // Prescribe form state
  const [artgQuery, setArtgQuery] = useState('');
  const [artgResults, setArtgResults] = useState<ArtgMedication[]>([]);
  const [selectedArtg, setSelectedArtg] = useState<ArtgMedication | null>(null);
  const [medicationName, setMedicationName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [artgId, setArtgId] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState('Once daily');
  const [directions, setDirections] = useState('');
  const [prescribedDate, setPrescribedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [repeats, setRepeats] = useState<number>(5);
  const [isPbs, setIsPbs] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingMedication, setSavingMedication] = useState(false);
  const [prescribeError, setPrescribeError] = useState('');

  // Cease modal state
  const [ceasingMed, setCeasingMed] = useState<PatientMedication | null>(null);
  const [ceaseReason, setCeaseReason] = useState('');
  const [ceasingLoading, setCeasingLoading] = useState(false);
  const [ceaseError, setCeaseError] = useState('');

  // Delete medication state
  const [deletingMedId, setDeletingMedId] = useState<string | null>(null);

  const handleRemovePatient = async () => {
    if (!patient) return;
    const confirmed = window.confirm(
      `Are you sure you want to remove ${patient.display_name} (${patient.email})?\n\nThis will remove them from your active patients list and delete their associated appointment records and notes.`
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deletePatient(patientId, patient.email);
      navigate('/clinician?view=patients');
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to remove patient.');
      setDeleting(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!patientId) {
      setError('Choose a patient from the clinician workspace first.');
      setLoading(false);
      return undefined;
    }

    void loadPatientProfile(patientId)
      .then((profile) => {
        if (!active) return;
        setPatient(profile);
        if (profile.medications) {
          setMedications(profile.medications);
        } else {
          void loadPatientMedications(patientId)
            .then((meds) => {
              if (active) setMedications(meds);
            })
            .catch(() => {});
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load the patient profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId]);

  // Handle ARTG medicine query
  const handleArtgSearch = (value: string) => {
    setArtgQuery(value);
    if (!value.trim()) {
      setArtgResults([]);
      return;
    }
    const results = searchArtgMedications(value, 8);
    setArtgResults(results);
  };

  const handleSelectArtg = (med: ArtgMedication) => {
    setSelectedArtg(med);
    setMedicationName(med.name);
    setBrandName(med.brand);
    setGenericName(med.generic);
    setArtgId(med.id);
    setDose(med.defaultDose || med.strength);
    setFrequency(med.defaultFrequency || 'Once daily');
    setDirections(med.defaultDirections || '');
    setRepeats(typeof med.defaultRepeats === 'number' ? med.defaultRepeats : 5);
    setIsPbs(med.pbs);
    setArtgQuery('');
    setArtgResults([]);
  };

  const handleClearSelectedArtg = () => {
    setSelectedArtg(null);
    setArtgId('');
  };

  const resetPrescribeForm = () => {
    setSelectedArtg(null);
    setArtgQuery('');
    setArtgResults([]);
    setMedicationName('');
    setGenericName('');
    setBrandName('');
    setArtgId('');
    setDose('');
    setFrequency('Once daily');
    setDirections('');
    setPrescribedDate(new Date().toISOString().slice(0, 10));
    setRepeats(5);
    setIsPbs(true);
    setNotes('');
    setPrescribeError('');
    setShowPrescribeModal(false);
  };

  const handleOpenPrescribeModal = () => {
    resetPrescribeForm();
    setShowPrescribeModal(true);
  };

  const handleRePrescribe = (pastMed: PatientMedication) => {
    resetPrescribeForm();
    setMedicationName(pastMed.medication_name);
    setGenericName(pastMed.generic_name || '');
    setBrandName(pastMed.brand_name || '');
    setArtgId(pastMed.artg_id || '');
    setDose(pastMed.dose);
    setFrequency(pastMed.frequency);
    setDirections(pastMed.directions || '');
    setRepeats(pastMed.repeats);
    setIsPbs(pastMed.is_pbs);
    setNotes(pastMed.notes || '');
    setPrescribedDate(new Date().toISOString().slice(0, 10));
    setShowPrescribeModal(true);
  };

  const handlePrescribeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicationName.trim()) {
      setPrescribeError('Please specify the medication name.');
      return;
    }
    if (!dose.trim()) {
      setPrescribeError('Please specify the dose (e.g. 20 mg).');
      return;
    }
    if (!frequency.trim()) {
      setPrescribeError('Please specify the frequency (e.g. Once daily).');
      return;
    }

    setSavingMedication(true);
    setPrescribeError('');

    try {
      const created = await prescribePatientMedication({
        patientId,
        medicationName: medicationName.trim(),
        genericName: genericName.trim() || undefined,
        brandName: brandName.trim() || undefined,
        artgId: artgId.trim() || undefined,
        dose: dose.trim(),
        frequency: frequency.trim(),
        directions: directions.trim() || undefined,
        prescribedDate: prescribedDate.trim() || undefined,
        repeats: Number(repeats) || 0,
        isPbs,
        notes: notes.trim() || undefined,
      });

      setMedications((prev) => [created, ...prev.filter((m) => m.id !== created.id)]);
      resetPrescribeForm();
    } catch (err) {
      setPrescribeError(err instanceof Error ? err.message : 'Unable to record prescription.');
    } finally {
      setSavingMedication(false);
    }
  };

  const handleCeaseMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ceasingMed) return;
    setCeasingLoading(true);
    setCeaseError('');

    try {
      const updated = await updatePatientMedication({
        medicationId: ceasingMed.id,
        action: 'cease',
        ceasedReason: ceaseReason.trim() || 'Ceased by clinician',
      });

      setMedications((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setCeasingMed(null);
      setCeaseReason('');
    } catch (err) {
      setCeaseError(err instanceof Error ? err.message : 'Unable to cease medication.');
    } finally {
      setCeasingLoading(false);
    }
  };

  const handleDeleteMedication = async (med: PatientMedication) => {
    const confirmed = window.confirm(
      `Remove ${med.medication_name} from ${patient?.display_name || 'patient'}'s record?`
    );
    if (!confirmed) return;

    setDeletingMedId(med.id);
    try {
      await deletePatientMedication(med.id);
      setMedications((prev) => prev.filter((m) => m.id !== med.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to delete medication record.');
    } finally {
      setDeletingMedId(null);
    }
  };

  const handleCopyMedicationList = () => {
    if (!patient) return;
    const activeList = medications.filter((m) => m.status === 'active');
    if (activeList.length === 0) {
      navigator.clipboard.writeText(`Patient: ${patient.display_name} (${patient.email})\nNo active medications recorded.`);
    } else {
      const text =
        `CURRENT MEDICATIONS — ${patient.display_name} (${patient.email})\n` +
        `Australian Clinical Record — Generated on ${new Date().toLocaleDateString('en-AU')}\n\n` +
        activeList
          .map((m, idx) => {
            const pbsTag = m.is_pbs ? '[PBS Subsidised]' : '[Private / Non-PBS]';
            const artgTag = m.artg_id ? ` (ARTG ${m.artg_id})` : '';
            const repText = `${m.repeats} repeat${m.repeats === 1 ? '' : 's'}`;
            const dirText = m.directions ? `\n   Directions: ${m.directions}` : '';
            const noteText = m.notes ? `\n   Notes: ${m.notes}` : '';
            const prescrText = `Prescribed: ${new Date(m.prescribed_date).toLocaleDateString('en-AU')} by ${m.prescribed_by_name}`;
            return `${idx + 1}. ${m.medication_name}${artgTag} ${pbsTag}\n   Dose: ${m.dose} | Frequency: ${m.frequency} | Repeats: ${repText}\n   ${prescrText}${dirText}${noteText}`;
          })
          .join('\n\n');
      navigator.clipboard.writeText(text);
    }
    setCopiedMedications(true);
    setTimeout(() => setCopiedMedications(false), 2500);
  };

  const activeMedications = useMemo(
    () => medications.filter((m) => m.status === 'active'),
    [medications]
  );
  const ceasedMedications = useMemo(
    () => medications.filter((m) => m.status === 'ceased' || m.status === 'completed'),
    [medications]
  );

  const displayedMedications =
    medicationsFilter === 'active'
      ? activeMedications
      : medicationsFilter === 'ceased'
      ? ceasedMedications
      : medications;

  if (loading)
    return (
      <div className="workspace-state">
        <LoaderCircle className="spin" />
        <strong>Loading patient history…</strong>
      </div>
    );
  if (error || !patient)
    return (
      <div className="workspace-state">
        <strong>Patient profile unavailable</strong>
        <span>{error || 'This patient could not be found.'}</span>
        <Link className="button button-primary" to="/clinician">
          Back to workspace
        </Link>
      </div>
    );

  const completed = patient.appointments.filter((appointment) => appointment.measurements.length > 0).length;
  const sampleCount = patient.appointments.reduce((total, appointment) => total + appointment.measurements.length, 0);
  const appointments = [...patient.appointments].sort(
    (left, right) => new Date(right.starts_at).valueOf() - new Date(left.starts_at).valueOf()
  );

  return (
    <div className="patient-profile-page">
      <Link className="back-link" to="/clinician">
        <ArrowLeft size={18} /> Back to workspace
      </Link>
      <section className="patient-profile-hero">
        <div className="patient-profile-hero-left">
          <div className="patient-profile-avatar">
            {patient.display_name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </div>
          <div>
            <p className="eyebrow">Patient profile</p>
            <h1>{patient.display_name}</h1>
            <p>
              <Mail size={15} /> {patient.email}
            </p>
          </div>
        </div>
        <div className="patient-profile-hero-actions">
          <button
            type="button"
            className="button button-secondary patient-remove-hero-btn"
            onClick={() => void handleRemovePatient()}
            disabled={deleting}
            title="Remove patient from active list"
          >
            {deleting ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
            {deleting ? 'Removing…' : 'Remove patient'}
          </button>
        </div>
      </section>
      {deleteError && (
        <p className="form-error" style={{ margin: '0 0 1rem' }}>
          {deleteError}
        </p>
      )}

      <section className="summary-strip patient-history-summary">
        <article>
          <div>
            <CalendarClock />
          </div>
          <span>
            <strong>{patient.appointments.length}</strong>Appointments
          </span>
        </article>
        <article>
          <div>
            <Pill />
          </div>
          <span>
            <strong>{activeMedications.length}</strong>Active medications
          </span>
        </article>
        <article>
          <div>
            <Activity />
          </div>
          <span>
            <strong>{completed}</strong>Completed checks
          </span>
        </article>
        <article>
          <div>
            <ClipboardList />
          </div>
          <span>
            <strong>{sampleCount}</strong>Saved API samples
          </span>
        </article>
      </section>

      {/* Cross-session Pulse Trend */}
      <PatientTrend patient={patient} />

      {/* MEDICATIONS & PRESCRIPTIONS SECTION */}
      <section className="panel patient-medications-panel">
        <div className="section-heading patient-medications-heading">
          <div>
            <p className="eyebrow">Pharmacotherapy & Prescriptions</p>
            <h2>Current Medications</h2>
            <p>
              Shared Australian clinical record indexed to the Australian Register of Therapeutic Goods (ARTG).
              Saved at the patient level so all doctors at this clinic share full visibility.
            </p>
          </div>
          <div className="patient-medications-header-actions">
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={handleCopyMedicationList}
              title="Copy active medication list formatted for clinical letters"
            >
              {copiedMedications ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
              {copiedMedications ? 'Copied to clipboard' : 'Copy medication list'}
            </button>
            <button
              type="button"
              className="button button-primary button-small"
              onClick={handleOpenPrescribeModal}
            >
              <Plus size={16} /> Prescribe medication
            </button>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="medication-filter-bar">
          <div className="medication-filter-tabs">
            <button
              type="button"
              className={`med-filter-tab ${medicationsFilter === 'active' ? 'active' : ''}`}
              onClick={() => setMedicationsFilter('active')}
            >
              Active regimen ({activeMedications.length})
            </button>
            <button
              type="button"
              className={`med-filter-tab ${medicationsFilter === 'ceased' ? 'active' : ''}`}
              onClick={() => setMedicationsFilter('ceased')}
            >
              Ceased / Past ({ceasedMedications.length})
            </button>
            <button
              type="button"
              className={`med-filter-tab ${medicationsFilter === 'all' ? 'active' : ''}`}
              onClick={() => setMedicationsFilter('all')}
            >
              All records ({medications.length})
            </button>
          </div>
        </div>

        {/* Medications List */}
        <div className="patient-medications-list">
          {displayedMedications.length === 0 ? (
            <div className="medication-empty-state">
              <Pill size={36} className="med-empty-icon" />
              <strong>
                {medicationsFilter === 'active'
                  ? 'No active medications recorded'
                  : medicationsFilter === 'ceased'
                  ? 'No ceased medications on file'
                  : 'No medication records found'}
              </strong>
              <p>
                {medicationsFilter === 'active'
                  ? 'Prescribe or assign an Australian ARTG medication or enter a custom prescription for this patient.'
                  : 'Past ceased prescriptions will appear here for audit and renewal.'}
              </p>
              {medicationsFilter === 'active' && (
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={handleOpenPrescribeModal}
                >
                  <Plus size={15} /> Prescribe first medication
                </button>
              )}
            </div>
          ) : (
            displayedMedications.map((med) => {
              const isActive = med.status === 'active';
              return (
                <article
                  key={med.id}
                  className={`patient-medication-card ${isActive ? 'is-active' : 'is-ceased'}`}
                >
                  <div className="med-card-header">
                    <div className="med-title-group">
                      <div className="med-name-row">
                        <strong className="med-primary-name">{med.medication_name}</strong>
                        {med.artg_id && (
                          <span className="med-artg-badge" title="Australian Register of Therapeutic Goods">
                            <ShieldCheck size={12} /> {med.artg_id}
                          </span>
                        )}
                        {med.is_pbs ? (
                          <span className="med-tag-badge pbs" title="Pharmaceutical Benefits Scheme Subsidised">
                            PBS
                          </span>
                        ) : (
                          <span className="med-tag-badge non-pbs" title="Private / Non-PBS Prescription">
                            Non-PBS
                          </span>
                        )}
                        <span className={`med-status-tag ${med.status}`}>
                          {med.status === 'active' ? 'Active' : 'Ceased'}
                        </span>
                      </div>
                      {med.generic_name && med.generic_name !== med.medication_name && (
                        <p className="med-generic-subtext">Active ingredient: {med.generic_name}</p>
                      )}
                    </div>

                    <div className="med-card-actions">
                      {isActive ? (
                        <button
                          type="button"
                          className="button button-secondary button-small med-cease-btn"
                          onClick={() => {
                            setCeasingMed(med);
                            setCeaseReason('');
                            setCeaseError('');
                          }}
                          title="Cease this medication"
                        >
                          Cease medication
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button button-secondary button-small med-renew-btn"
                          onClick={() => handleRePrescribe(med)}
                          title="Re-prescribe / renew this medication"
                        >
                          <RotateCcw size={14} /> Renew prescription
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-button med-delete-btn"
                        onClick={() => void handleDeleteMedication(med)}
                        disabled={deletingMedId === med.id}
                        title="Delete medication record"
                      >
                        {deletingMedId === med.id ? (
                          <LoaderCircle size={15} className="spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Dosing and Instructions Grid */}
                  <div className="med-details-grid">
                    <div className="med-detail-item">
                      <span className="med-detail-label">Dose</span>
                      <strong className="med-detail-val">{med.dose}</strong>
                    </div>
                    <div className="med-detail-item">
                      <span className="med-detail-label">Frequency</span>
                      <strong className="med-detail-val">{med.frequency}</strong>
                    </div>
                    <div className="med-detail-item">
                      <span className="med-detail-label">Repeats</span>
                      <strong className="med-detail-val">
                        {med.repeats} repeat{med.repeats === 1 ? '' : 's'}
                      </strong>
                    </div>
                    <div className="med-detail-item">
                      <span className="med-detail-label">Prescribed</span>
                      <span className="med-detail-val">
                        {new Date(med.prescribed_date).toLocaleDateString('en-AU', {
                          dateStyle: 'medium',
                        })}
                      </span>
                    </div>
                    <div className="med-detail-item">
                      <span className="med-detail-label">Prescribing Doctor</span>
                      <span className="med-detail-val">{med.prescribed_by_name}</span>
                    </div>
                  </div>

                  {/* Clinical Directions */}
                  {med.directions && (
                    <div className="med-directions-box">
                      <span className="med-directions-label">Directions for Patient</span>
                      <p>{med.directions}</p>
                    </div>
                  )}

                  {/* Clinical Notes */}
                  {med.notes && (
                    <div className="med-notes-box">
                      <span className="med-notes-label">Clinical Indication / Note</span>
                      <p>{med.notes}</p>
                    </div>
                  )}

                  {/* Ceased Notice */}
                  {!isActive && (
                    <div className="med-ceased-notice">
                      <AlertCircle size={14} />
                      <span>
                        Ceased on{' '}
                        {med.ceased_at
                          ? new Date(med.ceased_at).toLocaleDateString('en-AU', { dateStyle: 'medium' })
                          : 'record'}
                        {med.ceased_reason ? ` — Reason: ${med.ceased_reason}` : ''}
                      </span>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>

      {/* APPOINTMENTS & MEASUREMENTS SECTION */}
      <section className="panel patient-history-panel">
        <div className="section-heading patient-history-heading">
          <div>
            <p className="eyebrow">Longitudinal record</p>
            <h2>Appointments and measurements</h2>
            <p>
              Each saved sample is shown exactly as returned by the rPPG API. No portal-side averaging or quality
              weighting is applied.
            </p>
          </div>
        </div>
        <div className="patient-history-list">
          {appointments.map((appointment) => (
            <article className="patient-history-card" key={appointment.id}>
              {(() => {
                const details = appointmentDetail(appointment.reason);
                return (
                  <>
                    <div className="patient-history-main">
                      <div>
                        <strong>{details.reason || 'Consultation'}</strong>
                        <span>{dateTime(appointment.starts_at)}</span>
                      </div>
                      <div className="patient-history-actions">
                        <Link
                          className="button button-primary button-small"
                          to={`/consultation/${appointment.id}?role=clinician${
                            patient?.display_name ? `&patientName=${encodeURIComponent(patient.display_name)}` : ''
                          }`}
                        >
                          <Video size={15} /> Join call
                        </Link>
                        <Link
                          className="button button-secondary button-small"
                          to={`/clinician/review?appointment=${encodeURIComponent(
                            appointment.id
                          )}&patient=${encodeURIComponent(patientId)}`}
                        >
                          Review record
                        </Link>
                      </div>
                    </div>
                    {details.note && (
                      <aside className="patient-intake-note">
                        <div>
                          <MessageSquareText size={16} />
                          <span>Patient intake note</span>
                        </div>
                        <p>{details.note}</p>
                      </aside>
                    )}
                  </>
                );
              })()}
              {appointment.measurements.length ? (
                <>
                  {(() => {
                    const latest = appointment.measurements.at(-1)!;
                    return (
                      <div className="patient-measurement-summary">
                        <div>
                          <span>Latest API pulse</span>
                          <strong>
                            {number(latest.heart_rate_bpm)} <small>BPM</small>
                          </strong>
                        </div>
                        <div>
                          <span>Latest API breathing</span>
                          <strong>
                            {number(latest.respiratory_rate_bpm)} <small>breaths/min</small>
                          </strong>
                        </div>
                        <div>
                          <span>Latest API signal quality</span>
                          <strong>
                            {number(latest.signal_quality * 100)}
                            <small>%</small>
                          </strong>
                        </div>
                        <div>
                          <span>Saved API samples</span>
                          <strong>{appointment.measurements.length}</strong>
                        </div>
                      </div>
                    );
                  })()}
                  <button
                    className="text-button"
                    onClick={() => setExpanded(expanded === appointment.id ? undefined : appointment.id)}
                  >
                    {expanded === appointment.id
                      ? 'Hide raw samples'
                      : `View all ${appointment.measurements.length} samples`}
                  </button>
                  {expanded === appointment.id && (
                    <div className="raw-measurement-table" aria-label="All saved measurement samples">
                      <div className="raw-measurement-heading">
                        <span>Captured</span>
                        <span>Pulse</span>
                        <span>Breathing</span>
                        <span>Quality</span>
                      </div>
                      {appointment.measurements.map((measurement) => (
                        <div key={measurement.measured_at} className="raw-measurement-row">
                          <span>{dateTime(measurement.measured_at)}</span>
                          <span>{number(measurement.heart_rate_bpm)} BPM</span>
                          <span>{number(measurement.respiratory_rate_bpm)} /min</span>
                          <span>{number(measurement.signal_quality * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="patient-history-empty">
                  <UserRound size={17} /> No saved camera-check readings for this appointment.
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* PRESCRIBE MEDICATION MODAL */}
      {showPrescribeModal && (
        <div className="modal-backdrop" onClick={resetPrescribeForm}>
          <div
            className="modal-container prescribe-medication-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="prescribe-modal-title"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Australian Clinical Prescribing</p>
                <h3 id="prescribe-modal-title">Prescribe Medication</h3>
                <p className="modal-subtitle">
                  Prescribe for <strong>{patient.display_name}</strong>. Search the Australian Register of
                  Therapeutic Goods (ARTG) or specify a custom medicine.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={resetPrescribeForm}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePrescribeSubmit} className="prescribe-form">
              {prescribeError && <div className="form-error-banner">{prescribeError}</div>}

              {/* ARTG Quick Search */}
              <div className="form-group artg-search-group">
                <label htmlFor="artg-search-input">
                  Search Australian Register of Therapeutic Goods (ARTG)
                </label>
                <div className="artg-search-input-wrapper">
                  <input
                    id="artg-search-input"
                    type="text"
                    placeholder="Search brand, generic, or ingredient (e.g. Lipitor, Atorvastatin, Metformin, Salbutamol)..."
                    value={artgQuery}
                    onChange={(e) => handleArtgSearch(e.target.value)}
                    autoComplete="off"
                  />
                  {artgQuery && (
                    <button
                      type="button"
                      className="artg-clear-query-btn"
                      onClick={() => handleArtgSearch('')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Dropdown Suggestions */}
                {artgResults.length > 0 && (
                  <div className="artg-suggestions-dropdown">
                    <div className="artg-suggestions-header">
                      <span>ARTG Indexed Medicines (Click to populate)</span>
                    </div>
                    {artgResults.map((item) => (
                      <div
                        key={item.id}
                        className="artg-suggestion-item"
                        onClick={() => handleSelectArtg(item)}
                      >
                        <div className="artg-item-main">
                          <strong>{item.name}</strong>
                          <span className="artg-item-sub">
                            {item.generic} • {item.strength} {item.form}
                          </span>
                        </div>
                        <div className="artg-item-badges">
                          {item.pbs && <span className="pbs-pill">PBS</span>}
                          <span className="aust-pill">{item.id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected ARTG Badge */}
              {selectedArtg && (
                <div className="selected-artg-banner">
                  <ShieldCheck size={16} color="#16a34a" />
                  <div className="selected-artg-info">
                    <strong>ARTG Entry: {selectedArtg.name}</strong>
                    <span>
                      {selectedArtg.id} • {selectedArtg.strength} {selectedArtg.form}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="selected-artg-remove"
                    onClick={handleClearSelectedArtg}
                    title="Change ARTG selection"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Form Grid */}
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="med-name-input">Medication / Brand Name *</label>
                  <input
                    id="med-name-input"
                    type="text"
                    required
                    placeholder="e.g. Lipitor 20mg or Atorvastatin 20mg"
                    value={medicationName}
                    onChange={(e) => setMedicationName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="med-generic-input">Active Ingredient / Generic Name</label>
                  <input
                    id="med-generic-input"
                    type="text"
                    placeholder="e.g. Atorvastatin calcium"
                    value={genericName}
                    onChange={(e) => setGenericName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label htmlFor="med-dose-input">Dose *</label>
                  <input
                    id="med-dose-input"
                    type="text"
                    required
                    placeholder="e.g. 20 mg or 1 tablet"
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="med-frequency-input">Frequency *</label>
                  <input
                    id="med-frequency-input"
                    type="text"
                    required
                    list="frequency-presets"
                    placeholder="e.g. Once daily"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                  />
                  <datalist id="frequency-presets">
                    {FREQUENCY_PRESETS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>

                <div className="form-group">
                  <label htmlFor="med-repeats-input">Repeats Authorised</label>
                  <input
                    id="med-repeats-input"
                    type="number"
                    min="0"
                    max="11"
                    value={repeats}
                    onChange={(e) => setRepeats(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="med-prescribed-date">Prescription Date *</label>
                  <input
                    id="med-prescribed-date"
                    type="date"
                    required
                    value={prescribedDate}
                    onChange={(e) => setPrescribedDate(e.target.value)}
                  />
                </div>

                <div className="form-group med-checkbox-group">
                  <label className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={isPbs}
                      onChange={(e) => setIsPbs(e.target.checked)}
                    />
                    <span className="checkbox-text">
                      <strong>PBS Subsidised Prescription</strong>
                      <small>Uncheck for private or non-PBS benefit</small>
                    </span>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="med-directions-input">Directions for Patient / Instructions</label>
                <textarea
                  id="med-directions-input"
                  rows={2}
                  placeholder="e.g. Take one tablet once daily at night, with or without food. Swallow whole."
                  value={directions}
                  onChange={(e) => setDirections(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="med-notes-input">Clinical Notes / Indication (Optional)</label>
                <textarea
                  id="med-notes-input"
                  rows={2}
                  placeholder="e.g. Primary prevention of cardiovascular event. Review lipid profile in 3 months."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={resetPrescribeForm}
                  disabled={savingMedication}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={savingMedication}
                >
                  {savingMedication ? (
                    <>
                      <LoaderCircle size={16} className="spin" /> Recording prescription…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> Prescribe medication
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CEASE MEDICATION MODAL */}
      {ceasingMed && (
        <div className="modal-backdrop" onClick={() => setCeasingMed(null)}>
          <div
            className="modal-container cease-medication-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cease-modal-title"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow" style={{ color: '#b91c1c' }}>
                  Cease Regimen
                </p>
                <h3 id="cease-modal-title">Cease {ceasingMed.medication_name}</h3>
                <p className="modal-subtitle">
                  Record cessation in <strong>{patient.display_name}</strong>'s permanent profile.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCeasingMed(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCeaseMedication} className="cease-form">
              {ceaseError && <div className="form-error-banner">{ceaseError}</div>}

              <div className="form-group">
                <label>Select Reason for Cessation</label>
                <div className="cease-preset-chips">
                  {CEASE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      className={`cease-chip ${ceaseReason === reason ? 'active' : ''}`}
                      onClick={() => setCeaseReason(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="cease-reason-input">Additional Clinical Reason / Details</label>
                <textarea
                  id="cease-reason-input"
                  rows={3}
                  placeholder="e.g. Patient developed myalgia on 20mg dose; switching to Rosuvastatin 5mg."
                  value={ceaseReason}
                  onChange={(e) => setCeaseReason(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setCeasingMed(null)}
                  disabled={ceasingLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary med-cease-confirm-btn"
                  disabled={ceasingLoading}
                >
                  {ceasingLoading ? (
                    <>
                      <LoaderCircle size={16} className="spin" /> Updating…
                    </>
                  ) : (
                    'Confirm Cessation'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
