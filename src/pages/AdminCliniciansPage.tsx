import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Image,
  KeyRound,
  LoaderCircle,
  MapPin,
  Save,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  UserCog,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getClinicianAccessToken } from '../services/clinicAccess';
import { supabase } from '../services/supabase';

const CLINIC_BANNER_PRESETS = [
  { label: 'Modern Practice', url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1600&q=80' },
  { label: 'Telehealth Studio', url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1600&q=80' },
  { label: 'Diagnostic Clinic', url: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1600&q=80' },
  { label: 'Minimal Titanium', url: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1600&q=80' },
];

type Clinic = {
  id: string;
  name: string;
  slug: string;
  public_domain: string | null;
  website_headline?: string | null;
  website_intro?: string | null;
  website_about?: string | null;
  website_address?: string | null;
  website_specialties?: string | null;
  website_phone?: string | null;
  website_email?: string | null;
  website_banner_url?: string | null;
  website_banner_text?: string | null;
  website_banner_enabled?: boolean;
  website_enabled?: boolean;
};

type Clinician = {
  id: string;
  display_name: string;
  email: string;
  is_admin: boolean;
  is_platform_admin?: boolean;
  clinic_id: string | null;
  clinic_name?: string | null;
  professional_title?: string | null;
  about_me?: string | null;
  booking_token?: string | null;
  booking_enabled?: boolean;
  created_at: string;
};

type AdminPatient = {
  id: string;
  display_name: string;
  email: string;
  created_at: string;
  appointment_count: number;
  latest_appointment_at: string | null;
  clinician: { display_name: string } | null;
};

type Action = 'update' | 'reset_password';

const canTogglePlatformAdmin = (email?: string | null) => {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  return lower.includes('ramsay') || lower.includes('sid');
};

export function AdminCliniciansPage() {
  const [searchParams] = useSearchParams();
  const initialSlug = searchParams.get('newClinicSlug') ?? '';
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [clinicName, setClinicName] = useState(() => initialSlug ? initialSlug.split(/[-_]+/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') : '');
  const [clinicSlug, setClinicSlug] = useState(initialSlug);
  const [editingClinic, setEditingClinic] = useState<string | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [allClinics, setAllClinics] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [, setIsClinicManager] = useState(false);
  const [, setCurrentClinicId] = useState<string | null>(null);
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState('');

  const load = useCallback(async () => {
    try {
      const token = await getClinicianAccessToken();
      const response = await fetch('/api/admin-clinicians', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as {
        clinicians?: Clinician[];
        patients?: AdminPatient[];
        clinics?: Clinic[];
        allClinics?: { id: string; name: string; slug: string }[];
        currentClinicId?: string | null;
        isPlatformAdmin?: boolean;
        isClinicManager?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? 'Unable to load clinicians.');
      setClinicians(body.clinicians ?? []);
      setPatients(body.patients ?? []);
      setClinics(body.clinics ?? []);
      setAllClinics(body.allClinics ?? []);
      setIsPlatformAdmin(body.isPlatformAdmin === true);
      setIsClinicManager(body.isClinicManager === true || (!body.isPlatformAdmin && (body.clinicians?.some((c) => c.is_admin) ?? false)));
      setCurrentClinicId(body.currentClinicId ?? null);
      setClinicId((current) => current || body.currentClinicId || body.allClinics?.[0]?.id || body.clinics?.[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load clinicians.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const request = async (method: 'POST' | 'PATCH', payload: object) => {
    const token = await getClinicianAccessToken();
    const response = await fetch('/api/admin-clinicians', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({
      error: 'The clinician administration service is unavailable.',
    }))) as { message?: string; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Unable to update clinician access.');
    return body.message ?? 'Saved.';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      setMessage(await request('POST', { displayName, email, clinicId }));
      setDisplayName('');
      setEmail('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add clinician.');
    } finally {
      setSaving(false);
    }
  };

  const manage = async (clinician: Clinician, action: Action) => {
    setWorkingId(`${clinician.id}:${action}`);
    setError('');
    setMessage('');
    try {
      setMessage(
        await request('PATCH', {
          action,
          clinicianId: clinician.id,
          displayName: clinician.display_name,
          professionalTitle: clinician.professional_title ?? '',
          aboutMe: clinician.about_me ?? '',
          isAdmin: clinician.is_admin,
          isPlatformAdmin: clinician.is_platform_admin === true,
          clinicId: clinician.clinic_id,
        })
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update clinician.');
    } finally {
      setWorkingId('');
    }
  };

  const createClinic = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      setMessage(await request('PATCH', { action: 'create_clinic', clinicName, clinicSlug }));
      setClinicName('');
      setClinicSlug('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create clinic.');
    } finally {
      setSaving(false);
    }
  };

  const [uploadingBannerFor, setUploadingBannerFor] = useState<string | null>(null);

  const uploadClinicBanner = async (clinicId: string, file: File) => {
    if (!supabase) {
      setError('Database connection not available.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setError('Please select a JPG, PNG, or WebP image under 3 MB.');
      return;
    }
    setUploadingBannerFor(clinicId);
    setError('');
    setMessage('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/clinic-banner-${clinicId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('clinician-avatars')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = supabase.storage.from('clinician-avatars').getPublicUrl(path);
      setClinics((items) =>
        items.map((item) => (item.id === clinicId ? { ...item, website_banner_url: data.publicUrl } : item))
      );
      setMessage('Banner image uploaded. Click "Save clinic website" to publish changes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload banner.');
    } finally {
      setUploadingBannerFor(null);
    }
  };

  const updateClinic = async (event: FormEvent, clinic: Clinic) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      setMessage(
        await request('PATCH', {
          action: 'update_clinic',
          clinicId: clinic.id,
          clinicName: clinic.name,
          clinicSlug: clinic.slug,
          websiteHeadline: clinic.website_headline,
          websiteIntro: clinic.website_intro,
          websiteAbout: clinic.website_about,
          websiteAddress: clinic.website_address,
          websiteSpecialties: clinic.website_specialties,
          websitePhone: clinic.website_phone,
          websiteEmail: clinic.website_email,
          websiteBannerUrl: clinic.website_banner_url,
          websiteBannerText: clinic.website_banner_text,
          websiteBannerEnabled: clinic.website_banner_enabled !== false,
          websiteEnabled: clinic.website_enabled !== false,
        })
      );
      setEditingClinic(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update clinic website.');
    } finally {
      setSaving(false);
    }
  };

  const updateLocal = (id: string, patch: Partial<Clinician>) =>
    setClinicians((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );

  const deletePatient = async (patient: AdminPatient) => {
    if (
      !window.confirm(
        `Permanently delete ${patient.display_name} and all ${patient.appointment_count} linked appointment record${
          patient.appointment_count === 1 ? '' : 's'
        }? This also removes saved measurements and cannot be undone.`
      )
    )
      return;
    setWorkingId(`patient:${patient.id}`);
    setError('');
    setMessage('');
    try {
      const token = await getClinicianAccessToken();
      const response = await fetch('/api/admin-clinicians', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patientId: patient.id }),
      });
      const body = (await response.json().catch(() => ({
        error: 'Unable to remove patient.',
      }))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to remove patient.');
      setMessage(body.message ?? 'Patient removed.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove patient.');
    } finally {
      setWorkingId('');
    }
  };

  return (
    <div className="admin-page admin-page-wide">
      <Link to="/clinician" className="back-link">
        <ArrowLeft size={18} /> Back to clinician workspace
      </Link>

      {/* Add clinician section */}
      <section className="admin-card">
        <p className="eyebrow">
          {isPlatformAdmin ? 'Platform Administrator (Ramsay & Sid)' : 'Clinic Manager Portal'}
        </p>
        <h1>
          {isPlatformAdmin ? 'Platform & Medical Centre Administration' : `${clinics[0]?.name || 'Clinic'} Administration`}
        </h1>
        <p>
          {isPlatformAdmin
            ? 'Manage all medical centres, clinician assignments, and platform administrative permissions across Ventricura.'
            : `Manage doctors, account profiles, and public website details for ${clinics[0]?.name || 'your medical centre'}.`}
        </p>

        <form onSubmit={(event) => void submit(event)} className="access-form admin-add-form">
          <label>
            Clinician name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Dr Taylor Morgan"
              required
            />
          </label>
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@clinic.com"
              required
            />
          </label>
          {isPlatformAdmin ? (
            allClinics.length > 0 && (
              <label>
                Assign to Clinic
                <select
                  value={clinicId}
                  onChange={(event) => setClinicId(event.target.value)}
                  required
                >
                  {allClinics.length > 1 && <option value="">Choose clinic</option>}
                  {allClinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : (
            <label>
              Assigned Clinic
              <input
                value={clinics[0]?.name || 'Assigned to your clinic'}
                disabled
                readOnly
              />
            </label>
          )}
          <button className="button button-primary" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={18} /> : <UserPlus size={18} />}
            {saving ? 'Sending…' : 'Add clinician'}
          </button>
        </form>

        {message && <p className="access-message">{message}</p>}
        {error && (
          <p className="form-error">
            <CircleAlert size={16} /> {error}
          </p>
        )}
      </section>

      {/* Clinics & Public Webpages management section */}
      <section className="admin-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{isPlatformAdmin ? 'Ventricura Platform' : 'Clinic Website & Profile'}</p>
              <h2>{isPlatformAdmin ? 'Medical centres & websites' : `${clinics[0]?.name || 'Clinic'} Public Webpage & Details`}</h2>
              <p>
                {isPlatformAdmin
                  ? 'Create and manage every clinic on Ventricura. Each clinic receives a public web address and clinician booking directory.'
                  : `Manage what patients see on your clinic webpage at ventricura.com/${clinics[0]?.slug || 'your-clinic'}: doctors, address, specialties, and contact info.`}
              </p>
            </div>
            <Building2 size={24} />
          </div>

          {isPlatformAdmin && (
            <form
              className="access-form admin-add-form clinic-create-form"
              onSubmit={(event) => void createClinic(event)}
            >
              <label>
                Clinic name
                <input
                  value={clinicName}
                  onChange={(event) => setClinicName(event.target.value)}
                  placeholder="e.g. Grove Way Medical"
                  required
                />
              </label>
              <label>
                Public address label (URL slug)
                <input
                  value={clinicSlug}
                  onChange={(event) => setClinicSlug(event.target.value)}
                  placeholder="e.g. groveway or grove-way-medical"
                />
              </label>
              <div className="admin-managed-address">
                <span>Managed Ventricura address</span>
                <strong>ventricura.com/{clinicSlug || 'clinic-name'}</strong>
                <small>Public website for your clinic and practitioners.</small>
              </div>
              <button className="button button-primary" disabled={saving}>
                <Building2 size={18} /> Add medical centre
              </button>
            </form>
          )}

          <div className="clinic-site-list">
            {clinics.map((clinic) => {
              const assignedDoctors = clinicians.filter((c) => c.clinic_id === clinic.id);
              return (
              <article key={clinic.id} className="clinic-site-admin">
                <div>
                  <strong>{clinic.name}</strong>
                  <span>ventricura.com/{clinic.slug}</span>
                  <small>
                    {clinic.website_address ? `📍 ${clinic.website_address}` : 'No address set yet'} ·{' '}
                    {clinic.website_enabled !== false ? 'Live' : 'Hidden'}
                  </small>
                  <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#444' }}>
                    <strong>{assignedDoctors.length}</strong> doctor{assignedDoctors.length === 1 ? '' : 's'} assigned
                    {assignedDoctors.length > 0 ? `: ${assignedDoctors.map((d) => d.display_name).join(', ')}` : ' (assign doctors below)'}
                  </div>
                </div>
                <div className="clinic-site-actions">
                  <Link
                    className="text-button"
                    to={`/${clinic.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open website <ExternalLink size={15} />
                  </Link>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setEditingClinic(editingClinic === clinic.id ? null : clinic.id)
                    }
                  >
                    {editingClinic === clinic.id ? 'Close editor' : 'Edit clinic details & website'}
                  </button>
                </div>

                {editingClinic === clinic.id && (
                  <form
                    onSubmit={(event) => void updateClinic(event, clinic)}
                    className="clinic-site-form"
                  >
                    <label>
                      Clinic name
                      <input
                        value={clinic.name}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id ? { ...item, name: event.target.value } : item
                            )
                          )
                        }
                        required
                      />
                    </label>
                    <label>
                      Public address label (URL slug)
                      <input
                        value={clinic.slug}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id ? { ...item, slug: event.target.value } : item
                            )
                          )
                        }
                        required
                      />
                    </label>
                    <div className="admin-managed-address">
                      <span>Public web address</span>
                      <strong>ventricura.com/{clinic.slug}</strong>
                      <small>Patients can visit this URL directly or via /clinic/{clinic.slug}</small>
                    </div>

                    <label className="full-width-field">
                      Practice physical address
                      <input
                        value={clinic.website_address ?? ''}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id
                                ? { ...item, website_address: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="e.g. Level 3, 142 North Terrace, Adelaide SA 5000"
                      />
                    </label>

                    <label className="full-width-field">
                      Specialties (comma-separated list for website tags)
                      <input
                        value={clinic.website_specialties ?? ''}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id
                                ? { ...item, website_specialties: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="e.g. Cardiology, Arrhythmia Monitoring, Preventative Health, Telehealth"
                      />
                    </label>

                    <label>
                      Homepage headline
                      <input
                        value={clinic.website_headline ?? ''}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id
                                ? { ...item, website_headline: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="Specialist cardiology & telehealth care."
                      />
                    </label>

                    <label>
                      Practice phone
                      <input
                        value={clinic.website_phone ?? ''}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id
                                ? { ...item, website_phone: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="(08) 8234 5678"
                      />
                    </label>

                    <label>
                      Practice email
                      <input
                        type="email"
                        value={clinic.website_email ?? ''}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id
                                ? { ...item, website_email: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="reception@clinic.com"
                      />
                    </label>

                    <label className="full-width-field">
                      Intro summary
                      <textarea
                        value={clinic.website_intro ?? ''}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id
                                ? { ...item, website_intro: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="Book secure telehealth consultations with our clinical team from home."
                        rows={2}
                      />
                    </label>

                    <label className="full-width-field">
                      About the clinic
                      <textarea
                        value={clinic.website_about ?? ''}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id
                                ? { ...item, website_about: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="Detailed overview of your clinic's services, clinical team, and approach to patient care."
                        rows={3}
                      />
                    </label>

                    {/* Clinic Profile Cover Banner & Visual Identity */}
                    <div className="admin-clinic-banner-section full-width-field">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '0.92rem', color: '#171717', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Image size={16} /> Clinic Profile Cover Banner
                          </strong>
                          <span style={{ fontSize: '0.78rem', color: '#666' }}>
                            Displayed across your public clinic webpage at ventricura.com/{clinic.slug} and patient booking headers.
                          </span>
                        </div>
                        {clinic.website_banner_url && (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() =>
                              setClinics((items) =>
                                items.map((item) => (item.id === clinic.id ? { ...item, website_banner_url: null } : item))
                              )
                            }
                          >
                            <Trash2 size={13} /> Remove banner
                          </button>
                        )}
                      </div>

                      <div className="admin-banner-preview-box">
                        {clinic.website_banner_url ? (
                          <img src={clinic.website_banner_url} alt={`${clinic.name} Banner Preview`} />
                        ) : (
                          <div className="admin-banner-placeholder">
                            <Image size={32} />
                            <span>No banner image uploaded yet</span>
                          </div>
                        )}
                      </div>

                      <div className="admin-banner-controls-row">
                        <label className="button button-secondary button-small" style={{ cursor: 'pointer', margin: 0 }}>
                          {uploadingBannerFor === clinic.id ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <Camera size={15} />
                          )}
                          {uploadingBannerFor === clinic.id ? 'Uploading…' : 'Upload custom banner image'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            disabled={uploadingBannerFor === clinic.id}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadClinicBanner(clinic.id, file);
                            }}
                          />
                        </label>
                        <span style={{ fontSize: '0.74rem', color: '#666' }}>JPG, PNG or WebP · Up to 3 MB · 16:9 or 3:1 aspect ratio recommended</span>
                      </div>

                      <div>
                        <span style={{ fontWeight: 700, fontSize: '0.76rem', color: '#444', display: 'block', marginBottom: '6px' }}>
                          Or choose a clinical preset banner:
                        </span>
                        <div className="admin-banner-presets-row">
                          {CLINIC_BANNER_PRESETS.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              className="admin-banner-preset-btn"
                              onClick={() =>
                                setClinics((items) =>
                                  items.map((item) => (item.id === clinic.id ? { ...item, website_banner_url: preset.url } : item))
                                )
                              }
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label style={{ margin: 0, fontWeight: 600 }}>
                        Or enter direct banner image URL
                        <input
                          type="url"
                          value={clinic.website_banner_url ?? ''}
                          onChange={(event) =>
                            setClinics((items) =>
                              items.map((item) => (item.id === clinic.id ? { ...item, website_banner_url: event.target.value } : item))
                            )
                          }
                          placeholder="https://example.com/clinic-banner.jpg"
                        />
                      </label>

                      <label style={{ margin: 0, fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Sparkles size={14} style={{ color: '#0c8a6f' }} />
                          <span>Announcement / Alert banner text (optional)</span>
                        </div>
                        <input
                          value={clinic.website_banner_text ?? ''}
                          onChange={(event) =>
                            setClinics((items) =>
                              items.map((item) => (item.id === clinic.id ? { ...item, website_banner_text: event.target.value } : item))
                            )
                          }
                          placeholder="e.g. Bulk-billed Telehealth Consultations Available Australia-Wide · No Referral Needed"
                          maxLength={200}
                        />
                        <span style={{ fontSize: '0.74rem', color: '#666', fontWeight: 400 }}>
                          Displays as a prominent clinical announcement bar at the top of your clinic website and booking portal.
                        </span>
                      </label>

                      <label className="admin-toggle" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={clinic.website_banner_enabled !== false}
                          onChange={(event) =>
                            setClinics((items) =>
                              items.map((item) =>
                                item.id === clinic.id ? { ...item, website_banner_enabled: event.target.checked } : item
                              )
                            )
                          }
                        />
                        <span>Enable clinic banner & announcement on public profile</span>
                      </label>
                    </div>

                    <label className="admin-toggle">
                      <input
                        type="checkbox"
                        checked={clinic.website_enabled !== false}
                        onChange={(event) =>
                          setClinics((items) =>
                            items.map((item) =>
                              item.id === clinic.id
                                ? { ...item, website_enabled: event.target.checked }
                                : item
                            )
                          )
                        }
                      />
                      <span>Public website live</span>
                    </label>

                    <button className="button button-primary" disabled={saving}>
                      <Save size={16} /> Save clinic website
                    </button>
                  </form>
                )}
              </article>
              );
            })}
          </div>
        </section>

      {/* Clinicians & Doctor Roster Section */}
      <section className="admin-card clinician-roster">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{isPlatformAdmin ? 'Team & Practitioner Directory' : `${clinics[0]?.name || 'Clinic'} Team`}</p>
            <h2>{isPlatformAdmin ? 'Doctors & Clinicians across Ventricura' : `Doctors & Clinicians at ${clinics[0]?.name || 'Your Clinic'}`}</h2>
            <p>
              {isPlatformAdmin
                ? 'Assign clinicians to medical centres, manage doctor titles and bios displayed on public clinic websites, and control administrative permissions.'
                : `Manage practitioner profiles, clinical bios, and grant clinic manager capabilities for ${clinics[0]?.name || 'your clinic'}.`}
            </p>
          </div>
          <span>
            {clinicians.length} account{clinicians.length === 1 ? '' : 's'}
          </span>
        </div>

        {clinicians.length === 0 ? (
          <p className="empty-admin">No clinician accounts found.</p>
        ) : (
          <div className="clinician-list">
            {clinicians.map((clinician) => (
              <article className="clinician-admin-row clinician-admin-row-detailed" key={clinician.id}>
                <div className="clinician-admin-identity">
                  <div className="patient-avatar">
                    <UserCog size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong>{clinician.email || 'Account email unavailable'}</strong>
                      {clinician.is_platform_admin ? (
                        <span className="role-badge role-badge-platform">
                          <Building2 size={12} /> Platform Administrator
                        </span>
                      ) : clinician.is_admin ? (
                        <span className="role-badge role-badge-manager">
                          <ShieldCheck size={12} /> Clinic Manager
                        </span>
                      ) : (
                        <span className="role-badge role-badge-doctor">
                          <Stethoscope size={12} /> Doctor / Clinician
                        </span>
                      )}
                    </div>
                    <span>
                      {clinician.clinic_name
                        ? `Assigned to ${clinician.clinic_name}`
                        : 'Unassigned clinic'}{' '}
                      · Joined {new Date(clinician.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="clinician-edit-grid">
                  <label className="admin-field">
                    <span>Practitioner Name</span>
                    <input
                      value={clinician.display_name}
                      onChange={(event) =>
                        updateLocal(clinician.id, { display_name: event.target.value })
                      }
                      placeholder="Dr Taylor Morgan"
                    />
                  </label>

                  <label className="admin-field">
                    <span>Professional Title / Role</span>
                    <input
                      value={clinician.professional_title ?? ''}
                      onChange={(event) =>
                        updateLocal(clinician.id, { professional_title: event.target.value })
                      }
                      placeholder="e.g. Consultant Cardiologist"
                    />
                  </label>

                  <label className="admin-field">
                    <span>Assigned Clinic</span>
                    {isPlatformAdmin ? (
                      <select
                        value={clinician.clinic_id ?? ''}
                        onChange={(event) =>
                          updateLocal(clinician.id, { clinic_id: event.target.value || null })
                        }
                      >
                        <option value="">No clinic (unassigned)</option>
                        {allClinics.map((clinic) => (
                          <option key={clinic.id} value={clinic.id}>
                            {clinic.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={clinician.clinic_name || clinics[0]?.name || 'Assigned to your clinic'}
                        disabled
                        readOnly
                      />
                    )}
                  </label>

                  <label className="admin-field full-width">
                    <span>About / Bio (Shown on public clinic website)</span>
                    <textarea
                      value={clinician.about_me ?? ''}
                      onChange={(event) =>
                        updateLocal(clinician.id, { about_me: event.target.value })
                      }
                      placeholder="Clinical focus, specialties, and experience for patients booking appointments..."
                      rows={2}
                    />
                  </label>
                </div>

                <div className="clinician-admin-flags">
                  <label className="admin-toggle">
                    <input
                      type="checkbox"
                      checked={clinician.is_admin}
                      onChange={(event) =>
                        updateLocal(clinician.id, { is_admin: event.target.checked })
                      }
                    />
                    <span>
                      <ShieldCheck size={16} /> Clinic manager role
                    </span>
                  </label>

                  {isPlatformAdmin && (
                    <label className={`admin-toggle ${!canTogglePlatformAdmin(clinician.email) ? 'disabled-toggle' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={!canTogglePlatformAdmin(clinician.email)}
                        checked={clinician.is_platform_admin === true}
                        onChange={(event) =>
                          updateLocal(clinician.id, {
                            is_platform_admin: event.target.checked,
                            is_admin: event.target.checked ? true : clinician.is_admin,
                          })
                        }
                      />
                      <span>
                        <Building2 size={16} /> Platform administrator
                      </span>
                      {!canTogglePlatformAdmin(clinician.email) && (
                        <span className="admin-toggle-hint">(Ramsay & Sid only)</span>
                      )}
                    </label>
                  )}

                  {clinician.booking_token && (
                    <Link
                      to={`/book/${clinician.booking_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="clinician-booking-preview-link"
                    >
                      <CalendarDays size={14} />{' '}
                      {clinician.booking_enabled ? 'Booking link active' : 'Preview booking link'}
                    </Link>
                  )}
                </div>

                <div className="clinician-admin-actions">
                  <button
                    className="button button-primary button-small"
                    onClick={() => void manage(clinician, 'update')}
                    disabled={Boolean(workingId)}
                  >
                    {workingId === `${clinician.id}:update` ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Save size={15} />
                    )}
                    Save clinician details
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void manage(clinician, 'reset_password')}
                    disabled={Boolean(workingId)}
                  >
                    {workingId === `${clinician.id}:reset_password` ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <KeyRound size={15} />
                    )}
                    Send password reset
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Patient Records Section */}
      <section className="admin-card clinician-roster patient-admin-roster">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Patient records</p>
            <h2>All patients</h2>
            <p>
              Administrators can review all patient records across the clinic. Deleting a patient
              removes their appointments, private notes, invitations, and saved research
              measurements.
            </p>
          </div>
          <span>
            {patients.length} patient{patients.length === 1 ? '' : 's'}
          </span>
        </div>

        {patients.length === 0 ? (
          <p className="empty-admin">No patient records yet.</p>
        ) : (
          <div className="clinician-list">
            {patients.map((patient) => (
              <article className="clinician-admin-row admin-patient-row" key={patient.id}>
                <div className="clinician-admin-identity">
                  <div className="patient-avatar">
                    <UsersRound size={18} />
                  </div>
                  <div>
                    <strong>{patient.display_name}</strong>
                    <span>{patient.email}</span>
                  </div>
                </div>
                <div className="patient-admin-meta">
                  <strong>{patient.appointment_count}</strong>
                  <span>appointment{patient.appointment_count === 1 ? '' : 's'}</span>
                </div>
                <div className="patient-admin-meta">
                  <strong>
                    {patient.latest_appointment_at
                      ? new Date(patient.latest_appointment_at).toLocaleDateString()
                      : '—'}
                  </strong>
                  <span>latest appointment</span>
                </div>
                <div className="patient-admin-meta">
                  <strong>{patient.clinician?.display_name ?? 'Unknown'}</strong>
                  <span>assigned clinician</span>
                </div>
                <button
                  className="text-button danger-action"
                  onClick={() => void deletePatient(patient)}
                  disabled={Boolean(workingId)}
                >
                  {workingId === `patient:${patient.id}` ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  Delete patient
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
