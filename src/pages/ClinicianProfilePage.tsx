import { Camera, CircleAlert, LoaderCircle, Save, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { getClinicianAccessToken } from '../services/clinicAccess';
import { supabase } from '../services/supabase';

type Profile = { display_name: string; professional_title: string; about_me: string; photo_url: string; clinic_name: string | null };

export function ClinicianProfilePage() {
  const [profile, setProfile] = useState<Profile>({ display_name: '', professional_title: '', about_me: '', photo_url: '', clinic_name: null });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { void (async () => {
    try {
      const token = await getClinicianAccessToken();
      const response = await fetch('/api/admin-clinicians?action=self-profile', { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json() as { profile?: Profile; error?: string };
      if (!response.ok || !body.profile) throw new Error(body.error ?? 'Unable to load your profile.');
      setProfile(body.profile);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load your profile.'); }
    finally { setLoading(false); }
  })(); }, []);
  const upload = async (file: File) => {
    if (!supabase) throw new Error('The clinical database is not configured.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP image under 2 MB.');
    const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error('Please sign in again.');
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'; const path = `${user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('clinician-avatars').upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from('clinician-avatars').getPublicUrl(path); setProfile((current) => ({ ...current, photo_url: data.publicUrl }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const token = await getClinicianAccessToken();
      const response = await fetch('/api/admin-clinicians', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_self_profile', displayName: profile.display_name, professionalTitle: profile.professional_title, aboutMe: profile.about_me, photoUrl: profile.photo_url }) });
      const body = await response.json() as { message?: string; error?: string }; if (!response.ok) throw new Error(body.error ?? 'Unable to save profile.'); setMessage(body.message ?? 'Profile saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save profile.'); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="workspace-state"><LoaderCircle className="spin" /><strong>Loading your clinician profile…</strong></div>;
  return <main className="profile-page"><section className="page-intro"><p className="eyebrow">Clinician profile</p><h1>How patients see you</h1><p>Your photo, name, role and introduction appear on your booking page and appointment links.</p></section><form className="profile-editor" onSubmit={(event) => void submit(event)}><aside className="profile-photo-editor"><div className="profile-photo">{profile.photo_url ? <img src={profile.photo_url} alt="Your clinician profile" /> : <UserRound size={46} />}</div><label className="button button-secondary button-small"><Camera size={16} /> Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to upload photo.')); }} /></label><small>JPG, PNG or WebP · max 2 MB</small>{profile.clinic_name && <span className="profile-clinic">{profile.clinic_name}</span>}</aside><div className="profile-fields"><label>Display name<input required maxLength={120} value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} placeholder="Dr Alex Morgan" /></label><label>Professional title<input maxLength={120} value={profile.professional_title} onChange={(event) => setProfile({ ...profile, professional_title: event.target.value })} placeholder="Clinical pharmacist" /></label><label>About me<textarea maxLength={800} value={profile.about_me} onChange={(event) => setProfile({ ...profile, about_me: event.target.value })} placeholder="A short introduction patients will see before booking." rows={6} /></label>{error && <p className="form-error"><CircleAlert size={16} /> {error}</p>}{message && <p className="access-message">{message}</p>}<button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />}{saving ? 'Saving…' : 'Save clinician profile'}</button></div></form></main>;
}
