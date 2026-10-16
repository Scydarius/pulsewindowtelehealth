import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  HeartPulse,
  Info,
  LoaderCircle,
  Pill,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  prescribePatientMedication,
  type PatientMedication,
} from '../services/clinicAccess';
import {
  ARTG_MEDICATIONS,
  calculateSmartPbs,
  checkClinicalInteractions,
  getClinicalUses,
  getDistinctCategories,
  getPregnancyDescription,
  searchArtgMedications,
  type ArtgMedication,
  type ClinicalAlert,
} from '../utils/artgMedications';

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

const REPEATS_PRESETS = [0, 1, 2, 3, 5];

export type PrescribeMedicationModalProps = {
  patientId: string;
  patientName: string;
  isOpen: boolean;
  onClose: () => void;
  onPrescribed: (medication: PatientMedication, tablePending?: boolean) => void;
  existingMedications?: PatientMedication[];
  initialMedication?: Partial<PatientMedication> | null;
};

export function PrescribeMedicationModal({
  patientId,
  patientName,
  isOpen,
  onClose,
  onPrescribed,
  existingMedications = [],
  initialMedication = null,
}: PrescribeMedicationModalProps) {
  const [artgQuery, setArtgQuery] = useState('');
  const [artgResults, setArtgResults] = useState<ArtgMedication[]>([]);
  const [selectedArtg, setSelectedArtg] = useState<ArtgMedication | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
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
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [rightTab, setRightTab] = useState<'safety' | 'monograph' | 'counseling'>('safety');
  const [savingMedication, setSavingMedication] = useState(false);
  const [prescribeError, setPrescribeError] = useState('');

  const distinctCategories = useMemo(() => ['All', ...getDistinctCategories()], []);

  // Sync state when opening or when initialMedication changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialMedication) {
      const matchingArtg = initialMedication.artg_id
        ? ARTG_MEDICATIONS.find((m) => m.id === initialMedication.artg_id) || null
        : null;
      setSelectedArtg(matchingArtg);
      setMedicationName(initialMedication.medication_name || '');
      setGenericName(initialMedication.generic_name || '');
      setBrandName(initialMedication.brand_name || '');
      setArtgId(initialMedication.artg_id || '');
      setDose(initialMedication.dose || '');
      setFrequency(initialMedication.frequency || 'Once daily');
      setDirections(initialMedication.directions || '');
      setRepeats(typeof initialMedication.repeats === 'number' ? initialMedication.repeats : 5);
      setIsPbs(initialMedication.is_pbs !== false);
      setNotes(initialMedication.notes || '');
      setPrescribedDate(new Date().toISOString().slice(0, 10));
      setShowOptionalDetails(Boolean(initialMedication.notes));
    } else {
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
      setShowOptionalDetails(false);
      setPrescribeError('');
    }
  }, [isOpen, initialMedication]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleArtgSearch = (value: string, cat = selectedCategory) => {
    setArtgQuery(value);
    if (!value.trim() && cat === 'All') {
      setArtgResults([]);
      return;
    }
    const results = searchArtgMedications(value, {
      category: cat === 'All' ? undefined : cat,
      limit: 10,
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
    setRightTab('safety');
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
    setShowOptionalDetails(true);
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

  const smartPbsInfo = useMemo(() => {
    return calculateSmartPbs(selectedArtg, repeats);
  }, [selectedArtg, repeats]);

  const activeExistingMeds = useMemo(
    () => existingMedications.filter((m) => m.status === 'active'),
    [existingMedications]
  );

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
      activeExistingMeds
    );
  }, [medicationName, genericName, brandName, selectedArtg, activeExistingMeds]);

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
      const effectivePatientId = patientId || 'demo';
      const { medication: created, tablePending: isPending } = await prescribePatientMedication({
        patientId: effectivePatientId,
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

      onPrescribed(created, isPending);
      onClose();
    } catch (err) {
      setPrescribeError(err instanceof Error ? err.message : 'Unable to record prescription.');
    } finally {
      setSavingMedication(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container prescribe-medication-modal clean-prescribe-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prescribe-modal-title"
      >
        {/* CLEAN MODAL HEADER */}
        <div className="modal-header clean-modal-header">
          <div className="clean-modal-header-text">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="clean-rx-icon-badge">
                <Pill size={16} />
              </span>
              <h3 id="prescribe-modal-title">Electronic Prescription</h3>
              <span className="clean-patient-badge">Patient: {patientName || 'Patient'}</span>
            </div>
            <p className="clean-modal-subtitle">
              Issue an Australian electronic script or recorded medication therapy.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handlePrescribeSubmit} className="prescribe-form clean-prescribe-body">
          {prescribeError && <div className="form-error-banner">{prescribeError}</div>}

          <div className="clean-workstation-layout">
            {/* ================================================================= */}
            {/* LEFT COLUMN: PRESCRIBING FORM & DISPENSING INSTRUCTIONS */}
            {/* ================================================================= */}
            <div className="clean-form-column">
              {/* DRUG SELECTOR OR HERO CARD */}
              {selectedArtg ? (
                <div className="clean-drug-hero-card">
                  <div className="clean-drug-hero-left">
                    <div className="clean-drug-hero-title-row">
                      <strong>{selectedArtg.name}</strong>
                      <span className="clean-badge aust">{selectedArtg.id}</span>
                      <span className={`clean-badge schedule ${selectedArtg.schedule.toLowerCase()}`}>
                        {selectedArtg.schedule}
                      </span>
                      {selectedArtg.pbs ? (
                        <span className="clean-badge pbs">PBS</span>
                      ) : (
                        <span className="clean-badge private">Private</span>
                      )}
                      {selectedArtg.safeScriptMonitored && (
                        <span className="clean-badge safescript">
                          <ShieldAlert size={11} /> SafeScript
                        </span>
                      )}
                    </div>
                    <div className="clean-drug-hero-meta">
                      <span>{selectedArtg.generic}</span>
                      <span>•</span>
                      <span>{selectedArtg.strength} {selectedArtg.form}</span>
                      <span>•</span>
                      <span>{selectedArtg.drugClass}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="clean-change-drug-button"
                    onClick={handleClearSelectedArtg}
                  >
                    Change Medicine
                  </button>
                </div>
              ) : (
                <div className="clean-search-box">
                  <label htmlFor="clean-artg-search" className="clean-field-label">
                    Search Australian Register of Therapeutic Goods (ARTG)
                  </label>
                  <div className="clean-search-row">
                    <div className="clean-search-input-wrapper">
                      <input
                        id="clean-artg-search"
                        type="text"
                        placeholder="Type medicine brand, generic or condition (e.g. Lipitor, Metformin, Asthma)…"
                        value={artgQuery}
                        onChange={(e) => handleArtgSearch(e.target.value)}
                        autoComplete="off"
                        className="clean-text-input"
                      />
                      {artgQuery && (
                        <button
                          type="button"
                          className="clean-clear-btn"
                          onClick={() => handleArtgSearch('')}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <select
                      value={selectedCategory}
                      onChange={(e) => handleSelectCategory(e.target.value)}
                      className="clean-specialty-select"
                      title="Filter by specialty"
                    >
                      {distinctCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat === 'All' ? 'All Specialties' : cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dropdown Suggestions */}
                  {artgResults.length > 0 && (
                    <div className="clean-search-dropdown">
                      <div className="clean-dropdown-header">
                        <span>{artgResults.length} matching Australian medications</span>
                      </div>
                      {artgResults.map((item) => (
                        <div
                          key={item.id}
                          className="clean-dropdown-item"
                          onClick={() => handleSelectArtg(item)}
                        >
                          <div className="clean-item-text">
                            <div className="clean-item-name-row">
                              <strong>{item.name}</strong>
                              <span className="clean-badge aust">{item.id}</span>
                              <span className={`clean-badge schedule ${item.schedule.toLowerCase()}`}>
                                {item.schedule}
                              </span>
                              {item.pbs && <span className="clean-badge pbs">PBS</span>}
                            </div>
                            <span className="clean-item-sub">
                              {item.generic} • {item.strength} {item.form} • {item.drugClass}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* MANUAL OVERRIDE INPUTS (If custom medicine or fine-tuning) */}
              <div className="clean-form-grid-2">
                <div className="clean-field">
                  <label htmlFor="clean-med-name" className="clean-field-label">
                    Medicine / Brand Name *
                  </label>
                  <input
                    id="clean-med-name"
                    type="text"
                    required
                    placeholder="e.g. Lipitor 20mg"
                    value={medicationName}
                    onChange={(e) => setMedicationName(e.target.value)}
                    className="clean-text-input"
                  />
                </div>
                <div className="clean-field">
                  <label htmlFor="clean-generic-name" className="clean-field-label">
                    Active Ingredient
                  </label>
                  <input
                    id="clean-generic-name"
                    type="text"
                    placeholder="e.g. Atorvastatin calcium"
                    value={genericName}
                    onChange={(e) => setGenericName(e.target.value)}
                    className="clean-text-input"
                  />
                </div>
              </div>

              {/* DOSAGE & FREQUENCY */}
              <div className="clean-form-grid-2">
                <div className="clean-field">
                  <div className="clean-field-label-row">
                    <label htmlFor="clean-dose-input" className="clean-field-label">
                      Dose *
                    </label>
                    {selectedArtg?.commonDoses && selectedArtg.commonDoses.length > 0 && (
                      <span className="clean-field-hint">Quick dose presets:</span>
                    )}
                  </div>
                  <input
                    id="clean-dose-input"
                    type="text"
                    required
                    placeholder="e.g. 20 mg"
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                    className="clean-text-input"
                  />
                  {selectedArtg?.commonDoses && selectedArtg.commonDoses.length > 0 && (
                    <div className="clean-quick-dose-row">
                      {selectedArtg.commonDoses.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`clean-quick-chip ${dose === preset.dose ? 'active' : ''}`}
                          onClick={() => handleApplyDosePreset(preset)}
                          title={`Set dose to ${preset.dose} ${preset.frequency}`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="clean-field">
                  <label htmlFor="clean-frequency-input" className="clean-field-label">
                    Frequency *
                  </label>
                  <input
                    id="clean-frequency-input"
                    type="text"
                    required
                    list="clean-frequency-list"
                    placeholder="e.g. Once daily"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    className="clean-text-input"
                  />
                  <datalist id="clean-frequency-list">
                    {FREQUENCY_PRESETS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* DIRECTIONS FOR PATIENT */}
              <div className="clean-field">
                <div className="clean-field-label-row">
                  <label htmlFor="clean-directions-input" className="clean-field-label">
                    Patient Instructions / Directions
                  </label>
                  {selectedArtg?.counselingAdvice && (
                    <button
                      type="button"
                      className="clean-inline-action-btn"
                      onClick={handleCopyCounselingToDirections}
                    >
                      <Sparkles size={12} /> Add counseling advice
                    </button>
                  )}
                </div>
                <textarea
                  id="clean-directions-input"
                  rows={2}
                  placeholder="e.g. Take one tablet once daily at night with water."
                  value={directions}
                  onChange={(e) => setDirections(e.target.value)}
                  className="clean-textarea"
                />
              </div>

              {/* REPEATS & PBS STATUS */}
              <div className="clean-form-grid-3">
                <div className="clean-field">
                  <label className="clean-field-label">
                    Repeats Authorised
                    {selectedArtg?.maxPbsRepeats !== undefined && (
                      <span className="clean-field-hint"> (PBS max: {selectedArtg.maxPbsRepeats})</span>
                    )}
                  </label>
                  <div className="clean-repeats-button-group">
                    {REPEATS_PRESETS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`clean-repeat-btn ${repeats === r ? 'active' : ''}`}
                        onClick={() => handleRepeatsChange(r)}
                      >
                        {r}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="0"
                      max="11"
                      value={repeats}
                      onChange={(e) => handleRepeatsChange(parseInt(e.target.value, 10) || 0)}
                      className="clean-repeat-custom-input"
                      title="Custom repeats"
                    />
                  </div>
                </div>

                <div className="clean-field">
                  <label htmlFor="clean-prescribe-date" className="clean-field-label">
                    Prescription Date
                  </label>
                  <input
                    id="clean-prescribe-date"
                    type="date"
                    required
                    value={prescribedDate}
                    onChange={(e) => setPrescribedDate(e.target.value)}
                    className="clean-text-input"
                  />
                </div>

                <div className="clean-field">
                  <label className="clean-field-label">PBS Benefit</label>
                  <label className="clean-checkbox-tile">
                    <input
                      type="checkbox"
                      checked={isPbs}
                      onChange={(e) => setIsPbs(e.target.checked)}
                    />
                    <div className="clean-checkbox-text">
                      <strong>PBS Subsidised</strong>
                      <span>{smartPbsInfo.reason}</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* OPTIONAL CLINICAL INDICATION TOGGLE */}
              <div className="clean-collapsible-section">
                <button
                  type="button"
                  className="clean-collapsible-trigger"
                  onClick={() => setShowOptionalDetails((v) => !v)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={14} /> Clinical Indication & Prescriber Notes (Optional)
                  </span>
                  <ChevronDown
                    size={16}
                    style={{
                      transform: showOptionalDetails ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  />
                </button>

                {showOptionalDetails && (
                  <div className="clean-collapsible-content">
                    {clinicalUses.length > 0 && (
                      <div className="clean-indication-chips-box">
                        <span className="clean-field-hint">Common indications for this drug:</span>
                        <div className="clean-indication-chips">
                          {clinicalUses.map((use, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="clean-indication-chip"
                              onClick={() => handleApplyIndicationChip(use)}
                            >
                              + {use}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <textarea
                      rows={2}
                      placeholder="e.g. Ongoing lipid management. Review pathology in 3 months."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="clean-textarea"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ================================================================= */}
            {/* RIGHT COLUMN: CLINICAL DECISION SUPPORT & MONOGRAPH TABS */}
            {/* ================================================================= */}
            <div className="clean-decision-column">
              {selectedArtg ? (
                <div className="clean-monograph-card">
                  {/* Segmented tab bar */}
                  <div className="clean-monograph-tab-bar">
                    <button
                      type="button"
                      className={`clean-tab-btn ${rightTab === 'safety' ? 'active' : ''}`}
                      onClick={() => setRightTab('safety')}
                    >
                      <ShieldAlert size={14} /> Safety & Alerts
                      {clinicalAlerts.length > 0 && (
                        <span className="clean-alert-count-pill">{clinicalAlerts.length}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`clean-tab-btn ${rightTab === 'monograph' ? 'active' : ''}`}
                      onClick={() => setRightTab('monograph')}
                    >
                      <BookOpen size={14} /> Pharmacology
                    </button>
                    <button
                      type="button"
                      className={`clean-tab-btn ${rightTab === 'counseling' ? 'active' : ''}`}
                      onClick={() => setRightTab('counseling')}
                    >
                      <HeartPulse size={14} /> Counseling
                    </button>
                  </div>

                  {/* TAB 1: SAFETY & INTERACTIONS */}
                  {rightTab === 'safety' && (
                    <div className="clean-tab-content">
                      {/* Clinical interaction alerts */}
                      {clinicalAlerts.length > 0 ? (
                        <div className="clean-alerts-list">
                          {clinicalAlerts.map((alert, idx) => (
                            <div key={idx} className={`clean-alert-item ${alert.severity}`}>
                              <AlertTriangle size={16} className="clean-alert-icon" />
                              <div>
                                <strong>{alert.title}</strong>
                                <p>{alert.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="clean-safe-strip">
                          <CheckCircle2 size={16} color="#16a34a" />
                          <span>No critical drug-drug interactions detected with current active medications.</span>
                        </div>
                      )}

                      {/* TGA Pregnancy Category */}
                      {selectedArtg.pregnancyCategory && (
                        <div className="clean-info-block">
                          <span className="clean-info-title">
                            TGA Pregnancy Category {selectedArtg.pregnancyCategory}
                          </span>
                          <p>{getPregnancyDescription(selectedArtg.pregnancyCategory).detail}</p>
                        </div>
                      )}

                      {/* Warnings and Cautions */}
                      {selectedArtg.warningNote && (
                        <div className="clean-warning-block">
                          <AlertCircle size={15} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <strong>Clinical Warning:</strong> {selectedArtg.warningNote}
                          </div>
                        </div>
                      )}

                      {selectedArtg.cautionsAndContraindications && (
                        <div className="clean-info-block">
                          <span className="clean-info-title">Precautions & Contraindications</span>
                          <p>{selectedArtg.cautionsAndContraindications}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: PHARMACOLOGY & MONOGRAPH */}
                  {rightTab === 'monograph' && (
                    <div className="clean-tab-content">
                      {selectedArtg.indication && (
                        <div className="clean-info-block">
                          <span className="clean-info-title">Approved Clinical Indications</span>
                          <p>{selectedArtg.indication}</p>
                        </div>
                      )}

                      {selectedArtg.mechanismOfAction && (
                        <div className="clean-info-block">
                          <span className="clean-info-title">Mechanism of Action</span>
                          <p>{selectedArtg.mechanismOfAction}</p>
                        </div>
                      )}

                      {selectedArtg.monitoringAdvice && (
                        <div className="clean-info-block">
                          <span className="clean-info-title">Clinical Monitoring</span>
                          <p>{selectedArtg.monitoringAdvice}</p>
                        </div>
                      )}

                      {selectedArtg.adverseEffects && (
                        <div className="clean-info-block">
                          <span className="clean-info-title">Adverse Reactions</span>
                          <p>{selectedArtg.adverseEffects}</p>
                        </div>
                      )}

                      {selectedArtg.pbsRestrictionNote && (
                        <div className="clean-info-block">
                          <span className="clean-info-title">PBS Listing & Restrictions</span>
                          <p>
                            {selectedArtg.pbsListingType ? `[${selectedArtg.pbsListingType}] ` : ''}
                            {selectedArtg.pbsRestrictionNote}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: PATIENT COUNSELING */}
                  {rightTab === 'counseling' && (
                    <div className="clean-tab-content">
                      {selectedArtg.counselingAdvice && (
                        <div className="clean-info-block">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="clean-info-title">Patient Counseling & Administration</span>
                            <button
                              type="button"
                              className="clean-inline-action-btn"
                              onClick={handleCopyCounselingToDirections}
                            >
                              Insert in Directions
                            </button>
                          </div>
                          <p style={{ marginTop: '6px' }}>{selectedArtg.counselingAdvice}</p>
                        </div>
                      )}

                      {selectedArtg.storageAdvice && (
                        <div className="clean-info-block">
                          <span className="clean-info-title">Storage & Handling</span>
                          <p>{selectedArtg.storageAdvice}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="clean-monograph-empty-state">
                  <Stethoscope size={36} color="#94a3b8" />
                  <h4>Australian Clinical Drug Reference</h4>
                  <p>
                    Search or select an Australian medicine on the left to review real-time drug interaction checks,
                    TGA pregnancy classifications, PBS restrictions, and clinical monographs.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* CLEAN MODAL FOOTER */}
          <div className="modal-footer clean-modal-footer">
            <button
              type="button"
              className="button button-secondary"
              onClick={onClose}
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
                  <LoaderCircle size={16} className="spin" /> Prescribing…
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
  );
}
