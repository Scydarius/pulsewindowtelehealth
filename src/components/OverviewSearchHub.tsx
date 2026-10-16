import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  FileText,
  LoaderCircle,
  Pill,
  Search,
  Stethoscope,
  UsersRound,
  Video,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusPill } from './StatusPill';
import type { DatabaseSearchResults } from '../services/clinicAccess';

type SearchCategory = 'all' | 'patients' | 'appointments' | 'medications' | 'notes' | 'vitals' | 'directory';

type OverviewSearchHubProps = {
  query: string;
  loading: boolean;
  data: DatabaseSearchResults | null;
  category: SearchCategory;
  onSelectCategory: (cat: SearchCategory) => void;
  onClear: () => void;
  currentClinicianId?: string;
  clinicName?: string;
};

function highlightMatch(text: string | null | undefined, query: string) {
  if (!text) return '';
  if (!query.trim()) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={index} className="search-hub-highlight">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function OverviewSearchHub({
  query,
  loading,
  data,
  category,
  onSelectCategory,
  onClear,
  clinicName,
}: OverviewSearchHubProps) {
  const results = data?.results;
  const totalCount = data?.totalCount ?? 0;

  const patientCount = results?.patients.length ?? 0;
  const apptCount = results?.appointments.length ?? 0;
  const medCount = results?.medications.length ?? 0;
  const notesCount = results?.clinicalNotes.length ?? 0;
  const vitalsCount = results?.measurements.length ?? 0;
  const dirCount = (results?.clinicians.length ?? 0) + (results?.clinics.length ?? 0);

  return (
    <div className="overview-search-hub">
      {/* Search Header Banner */}
      <section className="search-hub-banner">
        <div className="search-hub-banner-top">
          <div className="search-hub-title-box">
            <p className="eyebrow" style={{ color: '#0c8a6f', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search size={13} /> Clinical Database Search
            </p>
            <h2>Database matches for &ldquo;{query}&rdquo;</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
              <span className="search-hub-stats-badge">
                {loading ? 'Searching database…' : `${totalCount} records found`}
              </span>
              <span style={{ fontSize: '0.8rem', color: '#686860' }}>
                Scoped to records accessible in {clinicName || 'your clinical practice'}
              </span>
            </div>
          </div>

          <button type="button" className="button button-secondary button-small" onClick={onClear}>
            <X size={15} /> Clear search & return to overview
          </button>
        </div>

        {/* Filter Category Pills */}
        <div className="search-hub-pills">
          <button
            type="button"
            className={`search-hub-filter-pill ${category === 'all' ? 'active' : ''}`}
            onClick={() => onSelectCategory('all')}
          >
            All Categories <span className="pill-count">{totalCount}</span>
          </button>
          <button
            type="button"
            className={`search-hub-filter-pill ${category === 'patients' ? 'active' : ''}`}
            onClick={() => onSelectCategory('patients')}
          >
            <UsersRound size={13} /> Patients <span className="pill-count">{patientCount}</span>
          </button>
          <button
            type="button"
            className={`search-hub-filter-pill ${category === 'appointments' ? 'active' : ''}`}
            onClick={() => onSelectCategory('appointments')}
          >
            <CalendarDays size={13} /> Appointments <span className="pill-count">{apptCount}</span>
          </button>
          <button
            type="button"
            className={`search-hub-filter-pill ${category === 'medications' ? 'active' : ''}`}
            onClick={() => onSelectCategory('medications')}
          >
            <Pill size={13} /> Medications <span className="pill-count">{medCount}</span>
          </button>
          <button
            type="button"
            className={`search-hub-filter-pill ${category === 'notes' ? 'active' : ''}`}
            onClick={() => onSelectCategory('notes')}
          >
            <FileText size={13} /> Notes <span className="pill-count">{notesCount}</span>
          </button>
          <button
            type="button"
            className={`search-hub-filter-pill ${category === 'vitals' ? 'active' : ''}`}
            onClick={() => onSelectCategory('vitals')}
          >
            <Activity size={13} /> Vitals <span className="pill-count">{vitalsCount}</span>
          </button>
          <button
            type="button"
            className={`search-hub-filter-pill ${category === 'directory' ? 'active' : ''}`}
            onClick={() => onSelectCategory('directory')}
          >
            <Building2 size={13} /> Directory <span className="pill-count">{dirCount}</span>
          </button>
        </div>
      </section>

      {/* Loading state */}
      {loading && (
        <div className="search-hub-loading">
          <LoaderCircle className="spin" size={22} />
          <span>Searching database across patients, consultations, electronic prescriptions, notes, and vitals…</span>
        </div>
      )}

      {/* Zero results state */}
      {!loading && data && totalCount === 0 && (
        <div className="search-hub-empty">
          <Search size={32} style={{ color: '#888' }} />
          <h3>No records found matching &ldquo;{query}&rdquo;</h3>
          <p>
            The clinical database checked patient profiles, consultation intake notes, prescribed medications, private
            clinical notes, and optical telemetry accessible to your clinician account.
          </p>
          <button type="button" className="button button-primary button-small" onClick={onClear}>
            Return to daily overview
          </button>
        </div>
      )}

      {/* 1. PATIENTS SECTION */}
      {!loading && results && (category === 'all' || category === 'patients') && results.patients.length > 0 && (
        <section className="search-hub-section">
          <div className="search-hub-section-header">
            <span className="search-hub-section-title">
              <UsersRound size={17} /> Patients in Database ({results.patients.length})
            </span>
            <Link to="/clinician?view=patients" className="text-button">
              View all directory patients <ArrowRight size={14} />
            </Link>
          </div>

          <div className="search-hub-grid">
            {results.patients.map((p) => (
              <article key={p.id} className="search-hub-item-card">
                <div className="search-hub-item-top">
                  <div className="search-hub-item-identity">
                    <Link to={`/clinician/patient?id=${encodeURIComponent(p.id)}`} className="search-hub-item-title">
                      {highlightMatch(p.displayName, query)}
                    </Link>
                    <span className="search-hub-item-meta">{highlightMatch(p.email, query)}</span>
                  </div>
                  <span className="mock-card-badge" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                    Patient
                  </span>
                </div>

                <div className="search-hub-item-meta" style={{ marginTop: '4px' }}>
                  {p.clinicName && (
                    <span>
                      <Building2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                      {p.clinicName}
                    </span>
                  )}
                  {p.clinicianName && <span>Assigned to {p.clinicianName}</span>}
                </div>

                <div className="search-hub-item-footer">
                  <span style={{ fontSize: '0.74rem', color: '#888' }}>
                    Created {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                  <Link
                    to={`/clinician/patient?id=${encodeURIComponent(p.id)}`}
                    className="button button-secondary button-small"
                  >
                    Open profile →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 2. APPOINTMENTS SECTION */}
      {!loading && results && (category === 'all' || category === 'appointments') && results.appointments.length > 0 && (
        <section className="search-hub-section">
          <div className="search-hub-section-header">
            <span className="search-hub-section-title">
              <CalendarDays size={17} /> Consultations & Appointments ({results.appointments.length})
            </span>
            <Link to="/clinician?view=appointments" className="text-button">
              View schedule <ArrowRight size={14} />
            </Link>
          </div>

          <div className="search-hub-grid">
            {results.appointments.map((a) => {
              const dateObj = new Date(a.startsAt);
              const isFuture = dateObj.getTime() >= Date.now() - 30 * 60 * 1000;
              return (
                <article key={a.id} className="search-hub-item-card">
                  <div className="search-hub-item-top">
                    <div className="search-hub-item-identity">
                      <Link
                        to={`/clinician/patient?id=${encodeURIComponent(a.patientId)}`}
                        className="search-hub-item-title"
                      >
                        {highlightMatch(a.patientName, query)}
                      </Link>
                      <span className="search-hub-item-meta">
                        {dateObj.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                        {dateObj.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <StatusPill tone={a.needsReview ? 'alert' : isFuture ? 'active' : 'neutral'}>
                      {a.needsReview ? 'Needs Review' : isFuture ? 'Scheduled' : 'Completed'}
                    </StatusPill>
                  </div>

                  <div className="search-hub-item-body">
                    <strong>Reason:</strong> {highlightMatch(a.reason, query)}
                    {a.intakeNote && (
                      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#555' }}>
                        <strong>Patient Note:</strong> {highlightMatch(a.intakeNote, query)}
                      </div>
                    )}
                  </div>

                  <div className="search-hub-item-footer">
                    <Link
                      to={`/clinician/patient?id=${encodeURIComponent(a.patientId)}`}
                      className="text-button"
                      style={{ fontSize: '0.78rem' }}
                    >
                      Patient Record
                    </Link>
                    <Link
                      to={`/consultation/${a.id}?role=clinician`}
                      className="button button-primary button-small"
                    >
                      <Video size={13} /> {isFuture ? 'Join call' : 'Review call'}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. MEDICATIONS SECTION */}
      {!loading && results && (category === 'all' || category === 'medications') && results.medications.length > 0 && (
        <section className="search-hub-section">
          <div className="search-hub-section-header">
            <span className="search-hub-section-title">
              <Pill size={17} /> Prescriptions & Medications ({results.medications.length})
            </span>
          </div>

          <div className="search-hub-grid">
            {results.medications.map((m) => (
              <article key={m.id} className="search-hub-item-card">
                <div className="search-hub-item-top">
                  <div className="search-hub-item-identity">
                    <span className="search-hub-item-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Pill size={14} style={{ color: '#0284c7', flexShrink: 0 }} />
                      {highlightMatch(m.medicationName, query)}
                    </span>
                    {m.genericName && (
                      <span className="search-hub-item-meta" style={{ fontStyle: 'italic' }}>
                        {highlightMatch(m.genericName, query)}
                      </span>
                    )}
                  </div>
                  <StatusPill tone={m.status === 'active' ? 'active' : 'neutral'}>{m.status}</StatusPill>
                </div>

                <div className="search-hub-item-body">
                  <div>
                    <strong>Dose & Frequency:</strong> {highlightMatch(`${m.dose} · ${m.frequency}`, query)}
                  </div>
                  {m.directions && (
                    <div style={{ marginTop: '3px' }}>
                      <strong>Directions:</strong> {highlightMatch(m.directions, query)}
                    </div>
                  )}
                  {m.notes && (
                    <div style={{ marginTop: '3px', color: '#555' }}>
                      <strong>Clinical Indication/Notes:</strong> {highlightMatch(m.notes, query)}
                    </div>
                  )}
                </div>

                <div className="search-hub-item-meta">
                  <span>
                    Prescribed for{' '}
                    <Link to={`/clinician/patient?id=${encodeURIComponent(m.patientId)}`} style={{ fontWeight: 650 }}>
                      {highlightMatch(m.patientName, query)}
                    </Link>
                  </span>
                  <span>· {m.prescribedByName} ({m.prescribedDate})</span>
                </div>

                <div className="search-hub-item-footer">
                  <span style={{ fontSize: '0.74rem', color: '#888' }}>
                    {m.repeats} repeats left {m.isPbs ? '· PBS' : ''}
                  </span>
                  <Link
                    to={`/clinician/patient?id=${encodeURIComponent(m.patientId)}`}
                    className="button button-secondary button-small"
                  >
                    View in patient profile →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 4. CLINICAL NOTES SECTION */}
      {!loading && results && (category === 'all' || category === 'notes') && results.clinicalNotes.length > 0 && (
        <section className="search-hub-section">
          <div className="search-hub-section-header">
            <span className="search-hub-section-title">
              <FileText size={17} /> Clinical Documentation & Private Notes ({results.clinicalNotes.length})
            </span>
          </div>

          <div className="search-hub-grid">
            {results.clinicalNotes.map((n) => (
              <article key={n.appointmentId} className="search-hub-item-card">
                <div className="search-hub-item-top">
                  <div className="search-hub-item-identity">
                    <span className="search-hub-item-title">
                      Clinical Note: {highlightMatch(n.patientName, query)}
                    </span>
                    <span className="search-hub-item-meta">
                      {n.appointmentReason} · Last updated {new Date(n.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="mock-card-badge" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                    SOAP Note
                  </span>
                </div>

                <div className="search-hub-item-body" style={{ whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto' }}>
                  {highlightMatch(n.content, query)}
                </div>

                <div className="search-hub-item-footer">
                  <span style={{ fontSize: '0.74rem', color: '#888' }}>Confidential clinician record</span>
                  {n.patientId && (
                    <Link
                      to={`/clinician/patient?id=${encodeURIComponent(n.patientId)}`}
                      className="button button-secondary button-small"
                    >
                      Open patient record →
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 5. VITALS & TELEMETRY SECTION */}
      {!loading && results && (category === 'all' || category === 'vitals') && results.measurements.length > 0 && (
        <section className="search-hub-section">
          <div className="search-hub-section-header">
            <span className="search-hub-section-title">
              <Activity size={17} /> Optical Telemetry & Vitals ({results.measurements.length})
            </span>
          </div>

          <div className="search-hub-grid">
            {results.measurements.map((m, idx) => (
              <article key={`${m.appointmentId}_${idx}`} className="search-hub-item-card">
                <div className="search-hub-item-top">
                  <div className="search-hub-item-identity">
                    <span className="search-hub-item-title">{highlightMatch(m.patientName, query)}</span>
                    <span className="search-hub-item-meta">{new Date(m.measuredAt).toLocaleString()}</span>
                  </div>
                  <span className="mock-card-badge" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                    rPPG Telemetry
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '12px', margin: '6px 0' }}>
                  <div style={{ background: '#f5f5f0', padding: '8px 12px', borderRadius: '4px', flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase' }}>Heart Rate</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#171717' }}>
                      {m.heartRateBpm} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>BPM</span>
                    </div>
                  </div>
                  <div style={{ background: '#f5f5f0', padding: '8px 12px', borderRadius: '4px', flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase' }}>Respiration</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#171717' }}>
                      {m.respiratoryRateBpm} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>RPM</span>
                    </div>
                  </div>
                </div>

                <div className="search-hub-item-footer">
                  <span style={{ fontSize: '0.74rem', color: '#888' }}>
                    Signal Quality: {Math.round(m.signalQuality * 100)}%
                  </span>
                  {m.patientId && (
                    <Link
                      to={`/clinician/patient?id=${encodeURIComponent(m.patientId)}`}
                      className="button button-secondary button-small"
                    >
                      View vitals history →
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 6. DIRECTORY SECTION (Clinicians & Clinics) */}
      {!loading && results && (category === 'all' || category === 'directory') && dirCount > 0 && (
        <section className="search-hub-section">
          <div className="search-hub-section-header">
            <span className="search-hub-section-title">
              <Building2 size={17} /> Clinicians & Clinics ({dirCount})
            </span>
          </div>

          <div className="search-hub-grid">
            {results.clinicians.map((c) => (
              <article key={c.id} className="search-hub-item-card">
                <div className="search-hub-item-top">
                  <div className="search-hub-item-identity">
                    <span className="search-hub-item-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Stethoscope size={14} style={{ color: '#0c8a6f' }} />
                      {highlightMatch(c.displayName, query)}
                    </span>
                    <span className="search-hub-item-meta">
                      {highlightMatch(c.professionalTitle || 'Clinician', query)}
                    </span>
                  </div>
                  <span className="mock-card-badge" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                    Doctor
                  </span>
                </div>

                {c.aboutMe && (
                  <p className="search-hub-item-meta" style={{ marginTop: '4px', lineHeight: 1.4 }}>
                    {highlightMatch(c.aboutMe.slice(0, 140) + '…', query)}
                  </p>
                )}

                <div className="search-hub-item-footer">
                  <span style={{ fontSize: '0.74rem', color: '#888' }}>{c.clinicName || 'Ventricura'}</span>
                  {c.clinicSlug && (
                    <a
                      href={`/${c.clinicSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary button-small"
                    >
                      Clinic Site ↗
                    </a>
                  )}
                </div>
              </article>
            ))}

            {results.clinics.map((cl) => (
              <article key={cl.id} className="search-hub-item-card">
                <div className="search-hub-item-top">
                  <div className="search-hub-item-identity">
                    <span className="search-hub-item-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Building2 size={14} style={{ color: '#171717' }} />
                      {highlightMatch(cl.name, query)}
                    </span>
                    <span className="search-hub-item-meta">{highlightMatch(cl.headline, query)}</span>
                  </div>
                  <span className="mock-card-badge" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                    Clinic Practice
                  </span>
                </div>

                {cl.specialties && (
                  <div className="search-hub-item-meta">
                    <strong>Specialties:</strong> {highlightMatch(cl.specialties, query)}
                  </div>
                )}

                <div className="search-hub-item-footer">
                  <span style={{ fontSize: '0.74rem', color: '#888' }}>/{cl.slug}</span>
                  <a
                    href={`/${cl.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button-secondary button-small"
                  >
                    Open Clinic Website ↗
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
