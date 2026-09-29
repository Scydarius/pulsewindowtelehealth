import { CalendarDays, Check, Copy, Link2, LoaderCircle, Power, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type BookingAvailabilityDay, type ClinicianBookingSettings, loadClinicianBookingSettings, saveClinicianBookingSettings } from '../services/clinicAccess';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fallbackSchedule: BookingAvailabilityDay[] = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, enabled: day > 0 && day < 6, start: '09:00', end: '17:00' }));

export function ClinicianAvailabilityPanel() {
  const [settings, setSettings] = useState<ClinicianBookingSettings>();
  const [schedule, setSchedule] = useState<BookingAvailabilityDay[]>(fallbackSchedule);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void loadClinicianBookingSettings().then((data) => { setSettings(data); setSchedule(data.weekly_availability); }).catch((error: Error) => setMessage(error.message)); }, []);
  const updateDay = (day: number, patch: Partial<BookingAvailabilityDay>) => setSchedule((current) => current.map((item) => item.day === day ? { ...item, ...patch } : item));
  const save = async () => {
    if (!settings) return;
    setSaving(true); setMessage('');
    try {
      const saved = await saveClinicianBookingSettings({ timezone: settings.timezone, duration_minutes: settings.duration_minutes, weekly_availability: schedule, booking_enabled: settings.booking_enabled, booking_reason: settings.booking_reason });
      setSettings((current) => current ? { ...current, bookingUrl: saved.bookingUrl, booking_token: saved.bookingToken, weekly_availability: schedule } : current);
      setMessage(settings.booking_enabled ? 'Booking link is live and availability has been saved.' : 'Availability saved. Turn on the booking link whenever you are ready.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save availability.'); }
    finally { setSaving(false); }
  };
  const copy = async () => { if (settings?.bookingUrl) { await navigator.clipboard.writeText(settings.bookingUrl); setMessage('Booking link copied.'); } };
  if (!settings && !message) return <div className="availability-loading"><LoaderCircle className="spin" /> Loading booking availability…</div>;
  if (!settings) return <p className="form-error">{message}</p>;
  return <section className="booking-settings" aria-label="Booking availability">
    <div className="booking-settings-head"><div><p className="eyebrow">Patient self-booking</p><h2>Availability and booking link</h2><p>Set the windows patients can choose from. Existing Ventricura appointments are automatically removed from the available slots.</p></div><div className={`booking-status ${settings.booking_enabled ? 'booking-status-live' : ''}`}><Power size={15} /> {settings.booking_enabled ? 'Booking link live' : 'Booking link paused'}</div></div>
    <div className="booking-controls"><label className="booking-switch"><input type="checkbox" checked={settings.booking_enabled} onChange={(event) => setSettings({ ...settings, booking_enabled: event.target.checked })} /><span><strong>Accept new bookings</strong><small>Patients can book only while this is switched on.</small></span></label><label>Appointment length<select value={settings.duration_minutes} onChange={(event) => setSettings({ ...settings, duration_minutes: Number(event.target.value) })}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option></select></label><label>Appointment type<input value={settings.booking_reason} onChange={(event) => setSettings({ ...settings, booking_reason: event.target.value })} maxLength={140} /></label></div>
    <div className="availability-timezone">Times are shown in <strong>Adelaide time</strong>. Google Calendar can be connected later for automatic external conflict checks.</div>
    <div className="availability-grid">{[1, 2, 3, 4, 5, 6, 0].map((day) => { const item = schedule.find((value) => value.day === day) ?? { day, enabled: false, start: '09:00', end: '17:00' }; return <div className={`availability-day ${item.enabled ? '' : 'availability-day-off'}`} key={day}><label className="day-enabled"><input type="checkbox" checked={item.enabled} onChange={(event) => updateDay(day, { enabled: event.target.checked })} /><span>{days[day]}</span></label><div className="availability-times"><input type="time" value={item.start} disabled={!item.enabled} onChange={(event) => updateDay(day, { start: event.target.value })} /><span>to</span><input type="time" value={item.end} disabled={!item.enabled} onChange={(event) => updateDay(day, { end: event.target.value })} /></div></div>; })}</div>
    <div className="booking-link-row"><div><span><Link2 size={16} /> Your patient booking link</span><input value={settings.bookingUrl} readOnly aria-label="Patient booking link" /></div><button type="button" className="button button-secondary" onClick={() => void copy()}><Copy size={16} /> Copy link</button><button type="button" className="button button-primary" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{saving ? 'Saving…' : 'Save availability'}</button></div>
    {message && <p className="booking-message"><Check size={16} /> {message}</p>}
  </section>;
}
