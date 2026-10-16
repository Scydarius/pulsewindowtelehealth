import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  HeartPulse,
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
      limit: 14,
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
              Prescribe for <strong>{patientName || 'Patient'}</strong>. Search the Australian Register of
              Therapeutic Goods (ARTG) or specify a custom medicine.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
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
                    list="frequency-presets-modal"
                    placeholder="e.g. Once daily"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                  />
                  <datalist id="frequency-presets-modal">
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
  );
}
