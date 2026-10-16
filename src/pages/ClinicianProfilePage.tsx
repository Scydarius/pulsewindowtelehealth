import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  CircleAlert,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  Megaphone,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  Video,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton } from '../components/CopyButton';
import { getClinicianAccessToken, loadClinicianBookingSettings } from '../services/clinicAccess';
import { supabase } from '../services/supabase';

type Profile = {
  display_name: string;
  professional_title: string;
  about_me: string;
  photo_url: string;
  clinic_name: string | null;
  clinic_slug?: string | null;
  clinic_banner_url?: string | null;
  clinic_banner_text?: string | null;
  booking_token?: string | null;
  booking_enabled?: boolean;
};

export function ClinicianProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    display_name: '',
    professional_title: '',
    about_me: '',
    photo_url: '',
    clinic_name: null,
    clinic_slug: null,
    clinic_banner_url: null,
    clinic_banner_text: null,
    booking_token: null,
    booking_enabled: false,
  });
  const [bookingUrl, setBookingUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [previewMode, setPreviewMode] = useState<'booking' | 'telehealth'>('booking');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getClinicianAccessToken();
        const response = await fetch('/api/admin-clinicians?action=self-profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await response.json()) as { profile?: Profile; error?: string };
        if (!response.ok || !body.profile) {
          throw new Error(body.error ?? 'Unable to load your profile.');
        }
        if (active) {
          setProfile(body.profile);
          if (body.profile.booking_token) {
            setBookingUrl(`${window.location.origin}/book/${body.profile.booking_token}`);
          }
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load your profile.');
      } finally {
        if (active) setLoading(false);
      }

      // Also try to load booking settings as a fallback / complement
      void loadClinicianBookingSettings()
        .then((settings) => {
          if (!active) return;
          if (settings.bookingUrl) setBookingUrl(settings.bookingUrl);
          else if (settings.booking_token) {
            setBookingUrl(`${window.location.origin}/book/${settings.booking_token}`);
          }
          if (settings.booking_token) {
            setProfile((current) => ({ ...current, booking_token: settings.booking_token }));
          }
        })
        .catch(() => {});
    })();

    return () => {
      active = false;
    };
  }, []);

  const upload = async (file: File) => {
    if (!supabase) throw new Error('The clinical database is not configured.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      throw new Error('Choose a JPG, PNG or WebP image under 2 MB.');
    }
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('clinician-avatars')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = supabase.storage.from('clinician-avatars').getPublicUrl(path);
      setProfile((current) => ({ ...current, photo_url: data.publicUrl }));
      setMessage('Photo uploaded. Click "Save clinician profile" to apply changes.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    setProfile((current) => ({ ...current, photo_url: '' }));
    setMessage('Photo removed. Click "Save clinician profile" to apply changes.');
  };

  const insertBioSnippet = (snippet: string) => {
    setProfile((current) => {
      const existing = current.about_me.trim();
      if (!existing) return { ...current, about_me: snippet };
      if (existing.includes(snippet)) return current;
      const combined = `${existing} ${snippet}`.slice(0, 800);
      return { ...current, about_me: combined };
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const token = await getClinicianAccessToken();
      const response = await fetch('/api/admin-clinicians', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_self_profile',
          displayName: profile.display_name,
          professionalTitle: profile.professional_title,
          aboutMe: profile.about_me,
          photoUrl: profile.photo_url,
        }),
      });
      const body = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to save profile.');
      setMessage(body.message ?? 'Your clinician profile has been saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="workspace-state">
        <LoaderCircle className="spin" />
        <strong>Loading your clinician profile…</strong>
      </div>
    );
  }

  const effectiveBookingUrl =
    bookingUrl || (profile.booking_token ? `${window.location.origin}/book/${profile.booking_token}` : '');

  return (
    <div className="profile-page">
      <Link to="/clinician" className="back-link">
        <ArrowLeft size={18} /> Back to clinician workspace
      </Link>

      <section className="page-intro clinician-intro">
        <div>
          <p className="eyebrow">Clinician workspace / Profile</p>
          <h1>How patients see you</h1>
          <p>
            Your photo, name, role and introduction appear on your public booking page, clinic website, and telehealth
            consultation room.
          </p>
        </div>
        <div className="workspace-actions">
          {effectiveBookingUrl && (
            <a
              href={effectiveBookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button button-secondary"
              title="Open your live patient booking page in a new window"
            >
              <ExternalLink size={16} /> Open booking page
            </a>
          )}
          <button
            type="button"
            className="button button-primary"
            onClick={(event) => void submit(event)}
            disabled={saving}
          >
            {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </section>

      <div className="profile-workspace-layout">
        {/* Left Column: Editor */}
        <form className="profile-editor-card" onSubmit={(event) => void submit(event)}>
          <div className="profile-card-header">
            <p className="eyebrow">Profile settings</p>
            <h2>Public Profile & Identity</h2>
            <p>
              Keep your professional details accurate so patients can easily identify and book consultations with you.
            </p>
          </div>

          {/* Photo Section */}
          <div className="profile-photo-section">
            <div className="profile-photo-large">
              {profile.photo_url ? (
                <img src={profile.photo_url} alt={profile.display_name || 'Clinician profile'} />
              ) : (
                <UserRound size={48} />
              )}
            </div>
            <div className="profile-photo-details">
              <div className="profile-photo-actions">
                <label className="button button-secondary button-small" style={{ cursor: 'pointer' }}>
                  {uploading ? <LoaderCircle size={15} className="spin" /> : <Camera size={15} />}
                  {uploading ? 'Uploading…' : 'Upload photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void upload(file).catch((reason: unknown) =>
                          setError(reason instanceof Error ? reason.message : 'Unable to upload photo.')
                        );
                      }
                    }}
                  />
                </label>
                {profile.photo_url && (
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={removePhoto}
                    title="Remove profile photo"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
              <span className="profile-photo-hint">JPG, PNG or WebP · Max 2 MB · Square format recommended</span>
              {profile.clinic_name && (
                <div className="profile-clinic-pill">
                  <Building2 size={13} /> {profile.clinic_name}
                </div>
              )}
            </div>
          </div>

          {/* Form Fields */}
          <div className="profile-form-grid">
            <label>
              <div className="profile-label-row">
                <span>Display name *</span>
                <span className="profile-helper-text">Required</span>
              </div>
              <input
                required
                maxLength={120}
                value={profile.display_name}
                onChange={(event) => setProfile({ ...profile, display_name: event.target.value })}
                placeholder="Dr Alex Morgan"
              />
              <span className="profile-helper-text">
                How your name is presented on booking confirmations, reminder emails, and video calls.
              </span>
            </label>

            <label>
              <span>Professional title & credentials</span>
              <input
                maxLength={120}
                value={profile.professional_title}
                onChange={(event) => setProfile({ ...profile, professional_title: event.target.value })}
                placeholder="Specialist General Practitioner & Telehealth Consultant"
              />
              <span className="profile-helper-text">
                Your role, medical specialty, or qualifications (e.g. Cardiologist, Clinical Pharmacist, Consultant
                Physician).
              </span>
            </label>

            <label>
              <div className="profile-label-row">
                <span>About me / Clinical biography</span>
                <span className="profile-field-counter">{profile.about_me.length} / 800</span>
              </div>
              <textarea
                maxLength={800}
                value={profile.about_me}
                onChange={(event) => setProfile({ ...profile, about_me: event.target.value })}
                placeholder="A short introduction patients will see before booking or joining consultation..."
                rows={6}
              />
              <span className="profile-helper-text">
                Summarise your clinical interests, consultation philosophy, or special areas of care.
              </span>
            </label>

            {/* Quick tag chips */}
            <div>
              <span className="profile-helper-text" style={{ display: 'block', marginBottom: '8px' }}>
                Quick additions (click to append to bio):
              </span>
              <div className="profile-quick-tags">
                <button
                  type="button"
                  className="profile-tag-chip"
                  onClick={() => insertBioSnippet('Specialising in preventative care and chronic disease management.')}
                >
                  + Preventative Care
                </button>
                <button
                  type="button"
                  className="profile-tag-chip"
                  onClick={() =>
                    insertBioSnippet('Experienced in optical telehealth monitoring and remote vital sign reviews.')
                  }
                >
                  + Optical Telehealth
                </button>
                <button
                  type="button"
                  className="profile-tag-chip"
                  onClick={() =>
                    insertBioSnippet('Providing comprehensive medication reviews and electronic prescribing.')
                  }
                >
                  + Pharmacotherapy
                </button>
                <button
                  type="button"
                  className="profile-tag-chip"
                  onClick={() => insertBioSnippet('Consultations conducted with patient-centered, evidence-based care.')}
                >
                  + Patient-Centered
                </button>
              </div>
            </div>

            {error && (
              <p className="form-error">
                <CircleAlert size={16} /> {error}
              </p>
            )}
            {message && (
              <p className="access-message">
                <CheckCircle2 size={16} /> {message}
              </p>
            )}

            <button
              type="submit"
              className="button button-primary"
              disabled={saving}
              style={{ minHeight: '48px', fontSize: '0.92rem' }}
            >
              {saving ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />}
              {saving ? 'Saving clinician profile…' : 'Save clinician profile'}
            </button>
          </div>
        </form>

        {/* Right Column: Live Patient Experience Preview */}
        <aside className="profile-preview-card">
          <div className="profile-card-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <p className="eyebrow" style={{ color: '#0c8a6f', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Eye size={13} /> Live Patient Experience
              </p>
              <span className="mock-card-badge">
                <CheckCircle2 size={11} /> Real-time preview
              </span>
            </div>
            <h2>How Patients See You</h2>
            <p>This preview updates live as you type, reflecting what patients experience across touchpoints.</p>
          </div>

          {/* Mode Switcher */}
          <div className="preview-tab-bar">
            <button
              type="button"
              className={`preview-tab-button ${previewMode === 'booking' ? 'active' : ''}`}
              onClick={() => setPreviewMode('booking')}
            >
              <CalendarDays size={14} /> Public Booking Card
            </button>
            <button
              type="button"
              className={`preview-tab-button ${previewMode === 'telehealth' ? 'active' : ''}`}
              onClick={() => setPreviewMode('telehealth')}
            >
              <Video size={14} /> Telehealth Video Room
            </button>
          </div>

          {/* Tab 1: Booking Card */}
          {previewMode === 'booking' ? (
            <div className="mock-booking-card" style={{ overflow: 'hidden' }}>
              {profile.clinic_banner_text && (
                <div style={{
                  padding: '8px 14px',
                  background: '#171717',
                  color: '#fff',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderBottom: '1px solid #333',
                  lineHeight: 1.3
                }}>
                  <Megaphone size={12} style={{ flexShrink: 0, color: '#38bdf8' }} />
                  <span>{profile.clinic_banner_text}</span>
                </div>
              )}
              {profile.clinic_banner_url && (
                <div style={{ width: '100%', height: '110px', overflow: 'hidden', background: '#171717', borderBottom: '1px solid #e5e5dc' }}>
                  <img
                    src={profile.clinic_banner_url}
                    alt={profile.clinic_name || 'Clinic Banner'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              )}
              <span className="mock-card-badge">
                <ShieldCheck size={12} /> AHPRA Registered Clinician
              </span>

              <div className="mock-card-header">
                <div className="mock-avatar">
                  {profile.photo_url ? (
                    <img src={profile.photo_url} alt={profile.display_name || 'Clinician'} />
                  ) : (
                    <UserRound size={32} />
                  )}
                </div>
                <div className="mock-identity">
                  <h3>{profile.display_name || 'Dr Alex Morgan'}</h3>
                  <span className="mock-title">
                    {profile.professional_title || 'General Practitioner & Telehealth Specialist'}
                  </span>
                  {profile.clinic_name && (
                    <span className="mock-clinic-name">
                      <Building2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                      {profile.clinic_name}
                    </span>
                  )}
                </div>
              </div>

              <p className="mock-bio">
                {profile.about_me ||
                  'Experienced medical practitioner offering secure telehealth appointments, vitals assessments, and continuous treatment follow-up.'}
              </p>

              <div className="mock-pills-row">
                <span className="mock-pill">
                  <Clock size={12} /> 30 min consultation
                </span>
                <span className="mock-pill">
                  <Video size={12} /> HD Video & Optical Vitals
                </span>
                <span className="mock-pill">
                  <FileText size={12} /> eScript Prescribing
                </span>
              </div>

              <div className="mock-slots-box">
                <span className="mock-slots-label">Sample Available Booking Times (Patient View)</span>
                <div className="mock-slots-grid">
                  <span className="mock-slot-button highlight">Today 9:30 AM</span>
                  <span className="mock-slot-button">Today 10:00 AM</span>
                  <span className="mock-slot-button">Today 11:30 AM</span>
                  <span className="mock-slot-button">Today 2:00 PM</span>
                </div>
              </div>
            </div>
          ) : (
            /* Tab 2: Telehealth Room */
            <div className="mock-waiting-room">
              <div className="mock-room-header">
                <span>VENTRICURA CLINICAL TELEHEALTH</span>
                <span className="mock-room-status">
                  <span style={{ fontSize: '1.2rem', lineHeight: 0.5 }}>●</span> Secure Stage
                </span>
              </div>

              <div className="mock-room-doctor">
                <div className="mock-room-avatar">
                  {profile.photo_url ? (
                    <img src={profile.photo_url} alt={profile.display_name || 'Clinician'} />
                  ) : (
                    <UserRound size={26} />
                  )}
                </div>
                <div className="mock-room-info">
                  <h4>{profile.display_name || 'Dr Alex Morgan'}</h4>
                  <p>
                    {profile.professional_title || 'Consultant Physician'}
                    {profile.clinic_name ? ` · ${profile.clinic_name}` : ''}
                  </p>
                </div>
              </div>

              <div className="mock-room-vitals-badge">
                <Activity size={16} style={{ color: '#4ade80' }} />
                <div>
                  <strong>Contactless Optical rPPG Telemetry Ready</strong>
                  <div style={{ fontSize: '0.7rem', color: '#a0a098', marginTop: '1px' }}>
                    Heart rate and respiration rate capture in active video session
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Direct Public Link Box */}
          <div className="profile-public-link-box">
            <h4>Your Direct Patient Booking Link</h4>
            <p>
              Patients can use this link to view your live appointment schedule and book consultations directly.
            </p>
            <div className="profile-link-input-row">
              <input
                readOnly
                value={effectiveBookingUrl || 'Loading booking link…'}
                aria-label="Direct booking URL"
              />
              {effectiveBookingUrl && (
                <>
                  <CopyButton
                    text={effectiveBookingUrl}
                    label="Copy"
                    copiedLabel="Copied!"
                    className="button button-secondary button-small"
                  />
                  <a
                    href={effectiveBookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button-secondary button-small"
                    title="Open live patient booking page"
                  >
                    <ExternalLink size={14} />
                  </a>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
