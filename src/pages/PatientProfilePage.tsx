import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  FileText,
  HeartPulse,
  Info,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Pill,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
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
import {
  ARTG_MEDICATIONS,
  calculateSmartPbs,
  checkClinicalInteractions,
  getArtgMedicationById,
  getClinicalUses,
  getDistinctCategories,
  getPregnancyDescription,
  searchArtgMedications,
  type ArtgMedication,
  type ClinicalAlert,
} from '../utils/artgMedications';
import { generatePatientSummaryReportHtml, printHtmlReport } from '../utils/clinicalReports';

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
  const [medSearchQuery, setMedSearchQuery] = useState('');
  const [tablePending, setTablePending] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Prescribe form state
  const [artgQuery, setArtgQuery] = useState('');
  const [artgResults, setArtgResults] = useState<ArtgMedication[]>([]);
  const [selectedArtg, setSelectedArtg] = useState<ArtgMedication | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [expandedMonographId, setExpandedMonographId] = useState<string | null>(null);
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

  const distinctCategories = useMemo(() => ['All', ...getDistinctCategories()], []);

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

  const SQL_MIGRATION = `-- Run this in Supabase SQL Editor to enable shared cloud medications:
create table if not exists public.patient_medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  prescribed_by_id uuid references public.clinician_profiles(id) on delete set null,
  prescribed_by_name text not null check (char_length(prescribed_by_name) between 1 and 160),
  medication_name text not null check (char_length(medication_name) between 1 and 240),
  generic_name text,
  brand_name text,
  artg_id text,
  dose text not null check (char_length(dose) between 1 and 120),
  frequency text not null check (char_length(frequency) between 1 and 160),
  directions text,
  prescribed_date date not null default current_date,
  repeats integer not null default 0 check (repeats >= 0),
  is_pbs boolean not null default true,
  status text not null default 'active' check (status in ('active', 'ceased', 'completed')),
  ceased_at timestamptz,
  ceased_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patient_medications_patient_id on public.patient_medications(patient_id);
create index if not exists idx_patient_medications_clinic_id on public.patient_medications(clinic_id);
create index if not exists idx_patient_medications_status on public.patient_medications(status);

alter table public.patient_medications enable row level security;
grant select, insert, update, delete on public.patient_medications to authenticated;

drop policy if exists "clinicians read patient medications" on public.patient_medications;
create policy "clinicians read patient medications" on public.patient_medications
  for select to authenticated using (true);

drop policy if exists "clinicians manage patient medications" on public.patient_medications;
create policy "clinicians manage patient medications" on public.patient_medications
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_MIGRATION);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
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
        if (profile.tablePending) setTablePending(true);
        if (profile.medications && profile.medications.length > 0) {
          setMedications(profile.medications);
        } else {
          void loadPatientMedications(patientId)
            .then(({ medications: meds, tablePending: isPending }) => {
              if (!active) return;
              if (isPending) setTablePending(true);
              setMedications(meds);
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

  // Handle ARTG medicine query with category filtering
  const handleArtgSearch = (value: string, cat = selectedCategory) => {
    setArtgQuery(value);
    if (!value.trim() && cat === 'All') {
      setArtgResults([]);
      return;
    }
    const results = searchArtgMedications(value, {
      category: cat === 'All' ? undefined : cat,
      limit: 12,
    });
    setArtgResults(results);
  };

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    handleArtgSearch(artgQuery, cat);
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
    const initialRepeats = typeof med.defaultRepeats === 'number' ? med.defaultRepeats : 5;
    setRepeats(initialRepeats);
    const pbsCalc = calculateSmartPbs(med, initialRepeats);
    setIsPbs(pbsCalc.isPbs);
    setArtgQuery('');
    setArtgResults([]);
  };

  const handleRepeatsChange = (val: number) => {
    const cleanVal = Math.max(0, val);
    setRepeats(cleanVal);
    const pbsCalc = calculateSmartPbs(selectedArtg, cleanVal);
    setIsPbs(pbsCalc.isPbs);
  };

  const handleApplyDosePreset = (preset: {
    label: string;
    dose: string;
    frequency: string;
    directions: string;
    repeats?: number;
  }) => {
    setDose(preset.dose);
    setFrequency(preset.frequency);
    if (preset.directions) {
      setDirections(preset.directions);
    }
    if (typeof preset.repeats === 'number') {
      setRepeats(preset.repeats);
      const pbsCalc = calculateSmartPbs(selectedArtg, preset.repeats);
      setIsPbs(pbsCalc.isPbs);
    }
  };

  const clinicalUses = useMemo(() => getClinicalUses(selectedArtg), [selectedArtg]);

  const handleApplyIndicationChip = (use: string) => {
    setNotes((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return use;
      if (trimmed.toLowerCase().includes(use.toLowerCase())) return trimmed;
      return `${trimmed}, ${use}`;
    });
  };

  const handleCopyCounselingToDirections = () => {
    if (!selectedArtg?.counselingAdvice) return;
    setDirections((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return selectedArtg.counselingAdvice!;
      if (trimmed.includes(selectedArtg.counselingAdvice!)) return trimmed;
      return `${trimmed}\n${selectedArtg.counselingAdvice!}`;
    });
  };

  const handleClearSelectedArtg = () => {
    setSelectedArtg(null);
    setArtgId('');
  };

  const resetPrescribeForm = () => {
    setSelectedArtg(null);
    setArtgQuery('');
    setArtgResults([]);
    setSelectedCategory('All');
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
    const matchingArtg = pastMed.artg_id
      ? ARTG_MEDICATIONS.find((m) => m.id === pastMed.artg_id) || null
      : null;
    setSelectedArtg(matchingArtg);
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
      const { medication: created, tablePending: isPending } = await prescribePatientMedication({
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

      if (isPending) {
        setTablePending(true);
      }

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
        patientId,
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
      await deletePatientMedication(med.id, patientId);
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

  const handlePrintMedications = () => {
    window.print();
  };

  const handlePrintSummaryReport = () => {
    if (!patient) return;
    const html = generatePatientSummaryReportHtml({
      patientId,
      patientName: patient.display_name,
      patientEmail: patient.email,
      clinicName: patient.clinic_name ?? undefined,
      assignedClinicianName: patient.assigned_clinician_name ?? undefined,
      appointments: patient.appointments,
      medications,
    });
    printHtmlReport(`Patient Summary — ${patient.display_name}`, html);
  };

  const activeMedications = useMemo(
    () => medications.filter((m) => m.status === 'active'),
    [medications]
  );
  const ceasedMedications = useMemo(
    () => medications.filter((m) => m.status === 'ceased' || m.status === 'completed'),
    [medications]
  );

  const smartPbsInfo = useMemo(() => {
    return calculateSmartPbs(selectedArtg, repeats);
  }, [selectedArtg, repeats]);

  const clinicalAlerts = useMemo<ClinicalAlert[]>(() => {
    if (!medicationName.trim()) return [];
    return checkClinicalInteractions(
      {
        medicationName,
        genericName,
        brandName,
        drugClass: selectedArtg?.drugClass,
        schedule: selectedArtg?.schedule,
      },
      activeMedications
    );
  }, [medicationName, genericName, brandName, selectedArtg, activeMedications]);

  const displayedMedications = useMemo(() => {
    const baseList =
      medicationsFilter === 'active'
        ? activeMedications
        : medicationsFilter === 'ceased'
        ? ceasedMedications
        : medications;
    const q = medSearchQuery.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter((m) => {
      const haystack = `${m.medication_name} ${m.generic_name ?? ''} ${m.brand_name ?? ''} ${m.dose} ${m.directions ?? ''} ${m.notes ?? ''} ${m.prescribed_by_name}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [medicationsFilter, activeMedications, ceasedMedications, medications, medSearchQuery]);

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
              <p className="eyebrow" style={{ margin: 0 }}>Patient profile</p>
              {patient.clinic_name && (
                <span className="patient-clinic-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#e0f2fe', color: '#0369a1', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '3px' }}>
                  <Building2 size={12} /> {patient.clinic_name}
                </span>
              )}
              {patient.assigned_clinician_name && (
                <span className="patient-doctor-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', color: '#334155', fontSize: '0.72rem', fontWeight: 650, padding: '2px 8px', borderRadius: '3px' }}>
                  <Stethoscope size={12} /> {patient.assigned_clinician_name}
                </span>
              )}
            </div>
            <h1>{patient.display_name}</h1>
            <p>
              <Mail size={15} /> {patient.email}
            </p>
          </div>
        </div>
        <div className="patient-profile-hero-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={handlePrintSummaryReport}
            title="Generate and print comprehensive medical health summary report"
          >
            <Printer size={15} /> Clinical summary report
          </button>
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
              onClick={handlePrintMedications}
              title="Print formal Australian medication summary chart for patient or pharmacy"
            >
              <Printer size={15} /> Print medication chart
            </button>
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

        {/* Database Migration Pending Notice */}
        {tablePending && (
          <div className="med-migration-banner">
            <div className="med-migration-info">
              <AlertCircle size={20} color="#b45309" className="med-migration-icon" />
              <div>
                <strong>Supabase Table Setup Required: <code>patient_medications</code></strong>
                <p>
                  The database table has not been created in your Supabase project yet.
                  Prescriptions are temporarily saved locally in this browser. To enable permanent shared cloud sync across all clinic doctors, run the 1-minute migration script in your Supabase SQL Editor.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="button button-secondary button-small med-copy-sql-btn"
              onClick={handleCopySql}
              title="Copy the SQL script to run in Supabase SQL editor"
            >
              {copiedSql ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
              {copiedSql ? 'SQL script copied!' : 'Copy SQL migration'}
            </button>
          </div>
        )}

        {/* Tab Filters and Search */}
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

          <div className="medication-search-wrapper">
            <Search size={14} className="med-search-icon" />
            <input
              type="text"
              placeholder="Search by brand, generic, dose, or indication…"
              value={medSearchQuery}
              onChange={(e) => setMedSearchQuery(e.target.value)}
              className="med-search-input"
            />
            {medSearchQuery && (
              <button
                type="button"
                className="med-search-clear-btn"
                onClick={() => setMedSearchQuery('')}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
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
              const matchingArtg = med.artg_id
                ? getArtgMedicationById(med.artg_id)
                : ARTG_MEDICATIONS.find(
                    (m) =>
                      (med.generic_name && m.generic.toLowerCase().includes(med.generic_name.toLowerCase())) ||
                      (med.brand_name && m.brand.toLowerCase() === med.brand_name.toLowerCase()) ||
                      m.name.toLowerCase() === med.medication_name.toLowerCase()
                  );
              const isExpanded = expandedMonographId === med.id;

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
                        {matchingArtg?.schedule === 'S8' && (
                          <span className="schedule-badge s8" title="Schedule 8 Controlled Medicine">
                            S8
                          </span>
                        )}
                        {matchingArtg?.pregnancyCategory && (
                          <span
                            className={`med-preg-badge ${getPregnancyDescription(matchingArtg.pregnancyCategory).badgeClass}`}
                            title={getPregnancyDescription(matchingArtg.pregnancyCategory).detail}
                          >
                            TGA Cat {matchingArtg.pregnancyCategory}
                          </span>
                        )}
                        {matchingArtg?.safeScriptMonitored && (
                          <span className="safescript-tiny-pill" title="SafeScript Monitored Medicine">
                            SafeScript
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
                      {matchingArtg && (
                        <button
                          type="button"
                          className={`button button-secondary button-small med-monograph-btn ${isExpanded ? 'active' : ''}`}
                          onClick={() => setExpandedMonographId(isExpanded ? null : med.id)}
                          title="View clinical drug monograph and counseling guide"
                        >
                          <BookOpen size={13} /> {isExpanded ? 'Hide Monograph' : 'Clinical Monograph'}
                        </button>
                      )}
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

                  {/* Expandable Clinical Drug Monograph */}
                  {isExpanded && matchingArtg && (
                    <div className="med-expanded-monograph">
                      <div className="monograph-expanded-header">
                        <div className="monograph-header-title">
                          <BookOpen size={16} color="#0284c7" />
                          <strong>Clinical Drug Monograph & Prescribing Guide</strong>
                          <span className="aust-pill">{matchingArtg.id}</span>
                        </div>
                        <div className="monograph-header-tags">
                          <span className={`schedule-badge ${matchingArtg.schedule.toLowerCase()}`}>
                            {matchingArtg.schedule}
                          </span>
                          {matchingArtg.pregnancyCategory && (
                            <span
                              className={`med-preg-badge ${getPregnancyDescription(matchingArtg.pregnancyCategory).badgeClass}`}
                              title={getPregnancyDescription(matchingArtg.pregnancyCategory).detail}
                            >
                              TGA Preg Cat {matchingArtg.pregnancyCategory}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="monograph-sections-grid">
                        {matchingArtg.indication && (
                          <div className="monograph-section-card">
                            <span className="monograph-sec-title">Approved Clinical Indications</span>
                            <p>{matchingArtg.indication}</p>
                          </div>
                        )}
                        {matchingArtg.mechanismOfAction && (
                          <div className="monograph-section-card">
                            <span className="monograph-sec-title">Mechanism of Action</span>
                            <p>{matchingArtg.mechanismOfAction}</p>
                          </div>
                        )}
                        {matchingArtg.counselingAdvice && (
                          <div className="monograph-section-card counseling">
                            <span className="monograph-sec-title">Patient Counseling Advice</span>
                            <p>{matchingArtg.counselingAdvice}</p>
                          </div>
                        )}
                        {matchingArtg.cautionsAndContraindications && (
                          <div className="monograph-section-card cautions">
                            <span className="monograph-sec-title">Cautions & Contraindications</span>
                            <p>{matchingArtg.cautionsAndContraindications}</p>
                          </div>
                        )}
                      </div>

                      <div className="monograph-footer-meta">
                        {matchingArtg.adverseEffects && (
                          <div className="monograph-footer-row">
                            <span className="meta-lbl">Adverse Effects:</span>
                            <span>{matchingArtg.adverseEffects}</span>
                          </div>
                        )}
                        {matchingArtg.monitoringAdvice && (
                          <div className="monograph-footer-row">
                            <span className="meta-lbl">Clinical Monitoring:</span>
                            <span>{matchingArtg.monitoringAdvice}</span>
                          </div>
                        )}
                        {matchingArtg.pbsRestrictionNote && (
                          <div className="monograph-footer-row">
                            <span className="meta-lbl">PBS Listing:</span>
                            <span>
                              {matchingArtg.pbsListingType ? `[${matchingArtg.pbsListingType}] ` : ''}
                              {matchingArtg.pbsRestrictionNote}
                            </span>
                          </div>
                        )}
                        {matchingArtg.storageAdvice && (
                          <div className="monograph-footer-row">
                            <span className="meta-lbl">Storage:</span>
                            <span>{matchingArtg.storageAdvice}</span>
                          </div>
                        )}
                      </div>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#64748b', marginTop: '2px', flexWrap: 'wrap' }}>
                          <span>{dateTime(appointment.starts_at)}</span>
                          {appointment.clinician_name && (
                            <span>• Dr. {appointment.clinician_name.replace(/^Dr\.?\s*/i, '')}</span>
                          )}
                          {appointment.clinic_name && (
                            <span>• {appointment.clinic_name}</span>
                          )}
                        </div>
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

              <div className="prescribe-workstation-grid">
                {/* LEFT COLUMN: PRESCRIBING WORKSPACE & CONTROLS */}
                <div className="prescribe-workspace-left">
                  {/* Specialty Category Filter Pills */}
                  <div className="artg-category-bar">
                    <span className="artg-cat-label">Filter by Clinical Specialty:</span>
                    <div className="artg-cat-scroll">
                      {distinctCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          className={`artg-cat-pill ${selectedCategory === cat ? 'active' : ''}`}
                          onClick={() => handleSelectCategory(cat)}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ARTG Quick Search */}
                  <div className="form-group artg-search-group">
                    <label htmlFor="artg-search-input">
                      Search Australian Register of Therapeutic Goods (ARTG)
                    </label>
                    <div className="artg-search-input-wrapper">
                      <input
                        id="artg-search-input"
                        type="text"
                        placeholder="Search brand, generic, drug class, or clinical indication (e.g. Lipitor, Metformin, Asthma, Gout, Migraine)..."
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
                          <span>
                            ARTG Indexed Medicines ({artgResults.length} matches
                            {selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''})
                          </span>
                        </div>
                        {artgResults.map((item) => (
                          <div
                            key={item.id}
                            className="artg-suggestion-item"
                            onClick={() => handleSelectArtg(item)}
                          >
                            <div className="artg-item-main">
                              <div className="artg-item-top-row">
                                <strong>{item.name}</strong>
                                {item.safeScriptMonitored && (
                                  <span className="safescript-tiny-pill" title="SafeScript Monitored">
                                    SafeScript
                                  </span>
                                )}
                              </div>
                              <span className="artg-item-sub">
                                {item.generic} • {item.strength} {item.form} • {item.drugClass}
                              </span>
                              {item.indication && (
                                <span className="artg-item-indication-snippet">
                                  Indication: {item.indication}
                                </span>
                              )}
                            </div>
                            <div className="artg-item-badges">
                              <span className={`schedule-badge ${item.schedule.toLowerCase()}`}>
                                {item.schedule}
                              </span>
                              {item.pregnancyCategory && (
                                <span
                                  className={`med-preg-badge ${getPregnancyDescription(item.pregnancyCategory).badgeClass}`}
                                  title={getPregnancyDescription(item.pregnancyCategory).detail}
                                >
                                  Cat {item.pregnancyCategory}
                                </span>
                              )}
                              {item.pbs ? (
                                <span className="pbs-pill">PBS</span>
                              ) : (
                                <span className="non-pbs-pill">Private</span>
                              )}
                              <span className="aust-pill">{item.id}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 1-Click Common Clinical Dosing Presets */}
                  {selectedArtg?.commonDoses && selectedArtg.commonDoses.length > 0 && (
                    <div className="dose-presets-container">
                      <div className="dose-presets-label">
                        <Sparkles size={13} color="#2563eb" />
                        <span>Common Clinical Doses (Click to populate)</span>
                      </div>
                      <div className="dose-presets-list">
                        {selectedArtg.commonDoses.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="dose-preset-chip"
                            onClick={() => handleApplyDosePreset(preset)}
                            title={`Apply dose: ${preset.dose}, ${preset.frequency}`}
                          >
                            <strong>{preset.label}</strong>
                            <span>{preset.frequency}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Form Input Fields */}
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
                      <label htmlFor="med-repeats-input">
                        Repeats Authorised
                        {selectedArtg && (
                          <span className="repeats-limit-hint">
                            (PBS max: {selectedArtg.maxPbsRepeats ?? 5})
                          </span>
                        )}
                      </label>
                      <input
                        id="med-repeats-input"
                        type="number"
                        min="0"
                        max="11"
                        value={repeats}
                        onChange={(e) => handleRepeatsChange(parseInt(e.target.value, 10) || 0)}
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
                          <small>Auto-calculated from ARTG listing & repeats</small>
                        </span>
                      </label>

                      {/* Smart PBS auto-toggle feedback box */}
                      <div
                        className={`smart-pbs-status-box ${smartPbsInfo.isPbs ? 'pbs-active' : 'pbs-inactive'} ${smartPbsInfo.exceedsMax ? 'exceeds-max' : ''}`}
                      >
                        <span className="smart-pbs-icon">
                          {smartPbsInfo.isPbs ? '✓' : smartPbsInfo.exceedsMax ? '⚠️' : 'ℹ'}
                        </span>
                        <span className="smart-pbs-reason-text">{smartPbsInfo.reason}</span>
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <div className="label-with-action">
                      <label htmlFor="med-directions-input">Directions for Patient / Instructions</label>
                      {selectedArtg?.counselingAdvice && (
                        <button
                          type="button"
                          className="helper-action-link"
                          onClick={handleCopyCounselingToDirections}
                          title="Insert clinical counseling advice into directions"
                        >
                          <Sparkles size={12} /> Insert Patient Counseling Advice
                        </button>
                      )}
                    </div>
                    <textarea
                      id="med-directions-input"
                      rows={2}
                      placeholder="e.g. Take one tablet once daily at night, with or without food. Swallow whole."
                      value={directions}
                      onChange={(e) => setDirections(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <div className="label-with-action">
                      <label htmlFor="med-notes-input">Clinical Notes / Indication (Optional)</label>
                      {clinicalUses.length > 0 && (
                        <span className="helper-label-hint">Click clinical use to add:</span>
                      )}
                    </div>
                    {clinicalUses.length > 0 && (
                      <div className="clinical-uses-chip-row">
                        {clinicalUses.map((use, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="clinical-use-chip"
                            onClick={() => handleApplyIndicationChip(use)}
                            title={`Add "${use}" to clinical notes`}
                          >
                            + {use}
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea
                      id="med-notes-input"
                      rows={2}
                      placeholder="e.g. Primary prevention of cardiovascular event. Review lipid profile in 3 months."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  {/* Clinical Advisory Pearl / Warning Note */}
                  {selectedArtg?.warningNote && (
                    <div className="clinical-pearl-banner">
                      <AlertCircle size={15} color="#d97706" />
                      <span>
                        <strong>Clinical Advisory:</strong> {selectedArtg.warningNote}
                      </span>
                    </div>
                  )}

                  {/* Real-Time Clinical Safety & Interaction Alerts */}
                  {clinicalAlerts.length > 0 && (
                    <div className="clinical-alerts-wrapper">
                      {clinicalAlerts.map((alert, idx) => (
                        <div key={idx} className={`clinical-alert-banner ${alert.severity}`}>
                          <div className="clinical-alert-icon">
                            <AlertTriangle size={18} />
                          </div>
                          <div className="clinical-alert-content">
                            <strong>{alert.title}</strong>
                            <p>{alert.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN: CLINICAL DRUG MONOGRAPH & DECISION SUPPORT PANEL */}
                <div className="prescribe-workspace-right">
                  {selectedArtg ? (
                    <div className="artg-monograph-card">
                      <div className="monograph-top-banner">
                        <div className="monograph-top-left">
                          <div className="monograph-brand-title">
                            <ShieldCheck size={18} color="#16a34a" />
                            <strong>{selectedArtg.name}</strong>
                            <span className="aust-pill">{selectedArtg.id}</span>
                            <span className={`schedule-badge ${selectedArtg.schedule.toLowerCase()}`}>
                              {selectedArtg.schedule}
                            </span>
                            {selectedArtg.safeScriptMonitored && (
                              <span
                                className="safescript-pill"
                                title="Monitored Medicine (SafeScript / ScriptCheck)"
                              >
                                <ShieldAlert size={12} /> SafeScript Monitored
                              </span>
                            )}
                          </div>
                          <div className="monograph-top-meta">
                            <span>Active: <strong>{selectedArtg.generic}</strong></span>
                            <span>•</span>
                            <span>Class: {selectedArtg.drugClass}</span>
                            <span>•</span>
                            <span>Category: {selectedArtg.category}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="selected-artg-remove"
                          onClick={handleClearSelectedArtg}
                          title="Change ARTG selection"
                        >
                          Change Drug
                        </button>
                      </div>

                      {/* Clinical Highlights Grid */}
                      <div className="monograph-body-grid">
                        {/* TGA Pregnancy Category Alert */}
                        {selectedArtg.pregnancyCategory && (
                          <div
                            className={`monograph-alert-box ${getPregnancyDescription(selectedArtg.pregnancyCategory).severity}`}
                          >
                            <div className="monograph-alert-icon">
                              <HeartPulse size={16} />
                            </div>
                            <div className="monograph-alert-text">
                              <strong>
                                TGA {getPregnancyDescription(selectedArtg.pregnancyCategory).title}
                              </strong>
                              <p>{getPregnancyDescription(selectedArtg.pregnancyCategory).detail}</p>
                            </div>
                          </div>
                        )}

                        {/* Indications & Mechanism of Action */}
                        <div className="monograph-grid-2col">
                          {selectedArtg.indication && (
                            <div className="monograph-field-box">
                              <div className="field-lbl-row">
                                <span className="field-lbl">Approved Clinical Indications</span>
                              </div>
                              <p>{selectedArtg.indication}</p>
                              {clinicalUses.length > 0 && (
                                <div className="monograph-use-tags">
                                  {clinicalUses.map((u, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      className="monograph-use-tag-btn"
                                      onClick={() => handleApplyIndicationChip(u)}
                                      title={`Click to copy "${u}" to prescription note`}
                                    >
                                      + {u}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {selectedArtg.mechanismOfAction && (
                            <div className="monograph-field-box">
                              <span className="field-lbl">Mechanism of Action</span>
                              <p>{selectedArtg.mechanismOfAction}</p>
                            </div>
                          )}
                        </div>

                        {/* Counseling Advice & Contraindications */}
                        <div className="monograph-grid-2col">
                          {selectedArtg.counselingAdvice && (
                            <div className="monograph-field-box counseling">
                              <div className="field-lbl-row">
                                <span className="field-lbl">Patient Counseling & Administration</span>
                                <button
                                  type="button"
                                  className="copy-into-dir-btn"
                                  onClick={handleCopyCounselingToDirections}
                                  title="Copy into patient directions"
                                >
                                  Use in Directions
                                </button>
                              </div>
                              <p>{selectedArtg.counselingAdvice}</p>
                            </div>
                          )}
                          {selectedArtg.cautionsAndContraindications && (
                            <div className="monograph-field-box cautions">
                              <span className="field-lbl">Precautions & Contraindications</span>
                              <p>{selectedArtg.cautionsAndContraindications}</p>
                            </div>
                          )}
                        </div>

                        {/* Adverse effects, Monitoring & PBS note */}
                        <div className="monograph-details-list">
                          {selectedArtg.adverseEffects && (
                            <div className="monograph-detail-row">
                              <strong>Adverse Reactions:</strong> <span>{selectedArtg.adverseEffects}</span>
                            </div>
                          )}
                          {selectedArtg.monitoringAdvice && (
                            <div className="monograph-detail-row">
                              <strong>Clinical Monitoring:</strong>{' '}
                              <span>{selectedArtg.monitoringAdvice}</span>
                            </div>
                          )}
                          {selectedArtg.pbsRestrictionNote && (
                            <div className="monograph-detail-row">
                              <strong>PBS Subsidised Listing:</strong>{' '}
                              <span>
                                {selectedArtg.pbsListingType ? `[${selectedArtg.pbsListingType}] ` : ''}
                                {selectedArtg.pbsRestrictionNote}
                              </span>
                            </div>
                          )}
                          {selectedArtg.storageAdvice && (
                            <div className="monograph-detail-row">
                              <strong>Storage & Handling:</strong> <span>{selectedArtg.storageAdvice}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="monograph-placeholder-card">
                      <Stethoscope size={44} color="#0284c7" className="placeholder-icon" />
                      <h4>Australian Clinical Drug Reference</h4>
                      <p>
                        Search or filter by clinical specialty on the left to select any medicine from the{' '}
                        <strong>Australian Register of Therapeutic Goods (ARTG)</strong> catalog.
                      </p>
                      <div className="placeholder-features-list">
                        <div className="placeholder-feature">
                          <ShieldCheck size={16} color="#16a34a" />
                          <div>
                            <strong>401+ Formulations Indexed</strong>
                            <span>Full Australian TGA registration numbers & PBS listing types</span>
                          </div>
                        </div>
                        <div className="placeholder-feature">
                          <HeartPulse size={16} color="#dc2626" />
                          <div>
                            <strong>TGA Pregnancy Classifications</strong>
                            <span>Categories A, B1, B2, B3, C, D, X with safety guidance</span>
                          </div>
                        </div>
                        <div className="placeholder-feature">
                          <AlertTriangle size={16} color="#d97706" />
                          <div>
                            <strong>Decision Support & Interaction Alerts</strong>
                            <span>Triple Whammy AKI risk, duplicate active ingredients, S8 SafeScript</span>
                          </div>
                        </div>
                        <div className="placeholder-feature">
                          <BookOpen size={16} color="#2563eb" />
                          <div>
                            <strong>1-Click Clinical Indications & Pearls</strong>
                            <span>Quick-populate clinical indications & counseling instructions</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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

      {/* PRINTABLE MEDICATION CHART (Formatted for A4 medical print & PDF export) */}
      <div className="printable-medication-chart" aria-hidden="true">
        <div className="print-header">
          <div className="print-clinic-brand">
            <h1>VENTRICURA TELEHEALTH</h1>
            <p>Integrated Clinical & Cardiovascular Care • Australia</p>
          </div>
          <div className="print-doc-title">
            <h2>CURRENT MEDICATION SUMMARY</h2>
            <p>Generated: {new Date().toLocaleDateString('en-AU', { dateStyle: 'full' })}</p>
          </div>
        </div>

        <div className="print-patient-meta">
          <div>
            <strong>Patient Name:</strong> {patient.display_name}
          </div>
          <div>
            <strong>Email / Identifier:</strong> {patient.email}
          </div>
          <div>
            <strong>Patient ID:</strong> {patient.id || patientId}
          </div>
          <div>
            <strong>Active Medications:</strong> {activeMedications.length}
          </div>
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Medication & Active Ingredient</th>
              <th>Dose</th>
              <th>Frequency</th>
              <th>Repeats</th>
              <th>PBS Benefit</th>
              <th>Directions for Patient</th>
              <th>Prescribed By / Date</th>
            </tr>
          </thead>
          <tbody>
            {activeMedications.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '16px' }}>
                  No active medications recorded for this patient.
                </td>
              </tr>
            ) : (
              activeMedications.map((m, idx) => (
                <tr key={m.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <strong>{m.medication_name}</strong>
                    {m.generic_name && <div className="print-sub">{m.generic_name}</div>}
                    {m.artg_id && <div className="print-sub-aust">{m.artg_id}</div>}
                  </td>
                  <td>{m.dose}</td>
                  <td>{m.frequency}</td>
                  <td>{m.repeats}</td>
                  <td>{m.is_pbs ? 'PBS Subsidised' : 'Private / Non-PBS'}</td>
                  <td>{m.directions || '—'}</td>
                  <td>
                    {m.prescribed_by_name}
                    <div className="print-sub">{new Date(m.prescribed_date).toLocaleDateString('en-AU')}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {ceasedMedications.length > 0 && (
          <div className="print-ceased-section">
            <h3>Recently Ceased / Inactive Regimens</h3>
            <table className="print-table print-ceased-table">
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Dose & Frequency</th>
                  <th>Ceased Date</th>
                  <th>Reason for Cessation</th>
                </tr>
              </thead>
              <tbody>
                {ceasedMedications.slice(0, 6).map((m) => (
                  <tr key={m.id}>
                    <td>{m.medication_name}</td>
                    <td>{m.dose} ({m.frequency})</td>
                    <td>{m.ceased_at ? new Date(m.ceased_at).toLocaleDateString('en-AU') : '—'}</td>
                    <td>{m.ceased_reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="print-footer">
          <div className="print-signature-box">
            <p>Clinician Signature: ____________________________________</p>
            <p>Prescriber / Provider Number: ___________________________</p>
          </div>
          <div className="print-disclaimer">
            This document is a confidential Australian clinical health record generated via Ventricura Telehealth.
            Dispensing pharmacists and treating healthcare practitioners should confirm clinical appropriateness before administration.
          </div>
        </div>
      </div>
    </div>
  );
}
