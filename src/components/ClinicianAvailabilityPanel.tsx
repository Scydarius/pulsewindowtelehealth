import {
  Calendar,
  CalendarCheck,
  CalendarDays,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  Power,
  RefreshCw,
  Save,
  Unlink,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CopyButton } from './CopyButton';
import {
  type BookingAvailabilityDay,
  type ClinicianBookingSettings,
  type GoogleCalendarStatus,
  disconnectGoogleCalendar,
  getGoogleCalendarAuthUrl,
  loadClinicianBookingSettings,
  loadGoogleCalendarStatus,
  saveClinicianBookingSettings,
  testGoogleCalendarSync,
  toggleGoogleCalendarSync,
} from '../services/clinicAccess';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fallbackSchedule: BookingAvailabilityDay[] = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
  day,
  enabled: day > 0 && day < 6,
  start: '09:00',
  end: '17:00',
}));

export function ClinicianAvailabilityPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<ClinicianBookingSettings>();
  const [schedule, setSchedule] = useState<BookingAvailabilityDay[]>(fallbackSchedule);
  const [calendarStatus, setCalendarStatus] = useState<GoogleCalendarStatus>();
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [testingSync, setTestingSync] = useState(false);
  const [diagnosticDetail, setDiagnosticDetail] = useState<string | null>(null);
  const [calendarNotice, setCalendarNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadClinicianBookingSettings()
      .then((data) => {
        setSettings(data);
        setSchedule(data.weekly_availability);
      })
      .catch((error: Error) => setMessage(error.message));

    void loadGoogleCalendarStatus()
      .then(setCalendarStatus)
      .catch(() => {});

    const calendarParam = searchParams.get('calendar');
    const calendarError = searchParams.get('calendar_error');
    if (calendarParam === 'connected') {
      setCalendarNotice({
        tone: 'success',
        text: 'Google Calendar successfully connected! Real-time external conflict checks and appointment syncing are active.',
      });
      searchParams.delete('calendar');
      setSearchParams(searchParams, { replace: true });
    } else if (calendarError) {
      setCalendarNotice({
        tone: 'error',
        text: `Google Calendar connection could not be completed (${calendarError}).`,
      });
      searchParams.delete('calendar_error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const updateDay = (day: number, patch: Partial<BookingAvailabilityDay>) =>
    setSchedule((current) => current.map((item) => (item.day === day ? { ...item, ...patch } : item)));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      const saved = await saveClinicianBookingSettings({
        timezone: settings.timezone,
        duration_minutes: settings.duration_minutes,
        weekly_availability: schedule,
        booking_enabled: settings.booking_enabled,
        booking_reason: settings.booking_reason,
      });
      setSettings((current) =>
        current
          ? {
              ...current,
              bookingUrl: saved.bookingUrl,
              booking_token: saved.bookingToken,
              weekly_availability: schedule,
            }
          : current
      );
      setMessage(
        settings.booking_enabled
          ? 'Booking link is live and availability has been saved.'
          : 'Availability saved. Turn on the booking link whenever you are ready.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save availability.');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (settings?.bookingUrl) {
      await navigator.clipboard.writeText(settings.bookingUrl);
      setMessage('Booking link copied.');
    }
  };

  const handleConnectCalendar = async () => {
    setConnectingCalendar(true);
    setCalendarNotice(null);
    try {
      const authUrl = await getGoogleCalendarAuthUrl();
      window.location.href = authUrl;
    } catch (error) {
      setCalendarNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not initiate Google Calendar connection.',
      });
      setConnectingCalendar(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (
      !window.confirm(
        'Disconnect Google Calendar? Ventricura will stop checking external calendar conflicts.'
      )
    )
      return;
    try {
      await disconnectGoogleCalendar();
      setCalendarStatus((curr) => (curr ? { ...curr, connected: false, email: null } : curr));
      setCalendarNotice({ tone: 'info', text: 'Google Calendar has been disconnected.' });
    } catch (error) {
      setCalendarNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not disconnect Google Calendar.',
      });
    }
  };

  const handleToggleSync = async (enabled: boolean) => {
    try {
      const syncEnabled = await toggleGoogleCalendarSync(enabled);
      setCalendarStatus((curr) => (curr ? { ...curr, syncEnabled } : curr));
    } catch (error) {
      setCalendarNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not update calendar sync setting.',
      });
    }
  };

  const handleTestSync = async () => {
    setTestingSync(true);
    setCalendarNotice(null);
    setDiagnosticDetail(null);
    try {
      const res = await testGoogleCalendarSync();
      if (res.success) {
        setCalendarNotice({
          tone: 'success',
          text: `Google Calendar test passed! Verified Free/Busy access (${res.calendarList?.count ?? 1} calendar(s) monitored) and appointment event creation.`,
        });
      } else {
        const calErr =
          (res.calendarList?.error as { message?: string })?.message ||
          (res.freeBusy?.details as { error?: { message?: string } })?.error?.message ||
          (res.createEvent?.details as { error?: { message?: string } })?.error?.message ||
          res.message ||
          res.error ||
          'Google returned an error.';

        const isApiDisabled =
          typeof calErr === 'string' &&
          (calErr.includes('Google Calendar API has not been used') || calErr.includes('disabled'));
        const isPermission =
          typeof calErr === 'string' &&
          (calErr.includes('insufficient') || calErr.includes('Permission') || res.freeBusy?.status === 401);

        if (isApiDisabled) {
          setCalendarNotice({
            tone: 'error',
            text: 'Google Calendar API is not yet enabled in your Google Cloud Console project (587139304907). It must be enabled for Ventricura to check conflicts and create events.',
          });
          setDiagnosticDetail('https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=587139304907');
        } else if (isPermission) {
          setCalendarNotice({
            tone: 'error',
            text: 'Google permission scope missing or revoked. Please disconnect and reconnect Google Calendar.',
          });
        } else {
          setCalendarNotice({
            tone: 'error',
            text: `Calendar test issue: ${calErr}`,
          });
          setDiagnosticDetail(JSON.stringify(res, null, 2));
        }
      }
    } catch (err) {
      setCalendarNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Could not test Google Calendar sync.',
      });
    } finally {
      setTestingSync(false);
    }
  };

  if (!settings && !message)
    return (
      <div className="availability-loading">
        <LoaderCircle className="spin" /> Loading booking availability…
      </div>
    );
  if (!settings) return <p className="form-error">{message}</p>;

  return (
    <section className="booking-settings" aria-label="Booking availability">
      <div className="booking-settings-head">
        <div>
          <p className="eyebrow">Patient self-booking</p>
          <h2>Availability and booking link</h2>
          <p>
            Set the windows patients can choose from. Existing Ventricura appointments and busy times on your Google Calendar are automatically removed from available slots.
          </p>
        </div>
        <div className={`booking-status ${settings.booking_enabled ? 'booking-status-live' : ''}`}>
          <Power size={15} /> {settings.booking_enabled ? 'Booking link live' : 'Booking link paused'}
        </div>
      </div>

      <div className="booking-controls">
        <label className="booking-switch">
          <input
            type="checkbox"
            checked={settings.booking_enabled}
            onChange={(event) => setSettings({ ...settings, booking_enabled: event.target.checked })}
          />
          <span>
            <strong>Accept new bookings</strong>
            <small>Patients can book only while this is switched on.</small>
          </span>
        </label>
        <label>
          Appointment length
          <select
            value={settings.duration_minutes}
            onChange={(event) => setSettings({ ...settings, duration_minutes: Number(event.target.value) })}
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </label>
        <label>
          Appointment type
          <input
            value={settings.booking_reason}
            onChange={(event) => setSettings({ ...settings, booking_reason: event.target.value })}
            maxLength={140}
          />
        </label>
      </div>

      <div className="availability-timezone">
        Times are shown in <strong>Adelaide time</strong>.
      </div>

      <div className="availability-grid">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const item = schedule.find((value) => value.day === day) ?? {
            day,
            enabled: false,
            start: '09:00',
            end: '17:00',
          };
          return (
            <div className={`availability-day ${item.enabled ? '' : 'availability-day-off'}`} key={day}>
              <label className="day-enabled">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(event) => updateDay(day, { enabled: event.target.checked })}
                />
                <span>{days[day]}</span>
              </label>
              <div className="availability-times">
                <input
                  type="time"
                  value={item.start}
                  disabled={!item.enabled}
                  onChange={(event) => updateDay(day, { start: event.target.value })}
                />
                <span>to</span>
                <input
                  type="time"
                  value={item.end}
                  disabled={!item.enabled}
                  onChange={(event) => updateDay(day, { end: event.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Google Calendar synchronization section */}
      <section className="calendar-sync-section" aria-label="Google Calendar Sync">
        <div className="calendar-sync-head">
          <div>
            <p className="eyebrow">External calendar</p>
            <h3>Google Calendar synchronization</h3>
            <p>
              Connect your Google Calendar to automatically remove busy times from your patient booking calendar, and add confirmed appointments directly to your Google Calendar.
            </p>
          </div>
          <div className={`calendar-status-badge ${calendarStatus?.connected ? 'connected' : ''}`}>
            {calendarStatus?.connected ? <CalendarCheck size={14} /> : <Calendar size={14} />}
            {calendarStatus?.connected ? 'Connected' : 'Not connected'}
          </div>
        </div>

        <div className="calendar-sync-body">
          <div className="calendar-sync-details">
            {calendarStatus?.connected ? (
              <>
                <strong>Connected as {calendarStatus.email || 'your Google account'}</strong>
                <span>External events will automatically block patient booking slots.</span>
              </>
            ) : (
              <>
                <strong>No Google Calendar linked</strong>
                <span>
                  {calendarStatus?.configured === false
                    ? 'Google Calendar API credentials are not yet configured in server environment variables.'
                    : 'Link your Google account with one click to enable automatic conflict prevention.'}
                </span>
              </>
            )}
          </div>

          <div className="calendar-sync-actions">
            {calendarStatus?.connected ? (
              <>
                <label className="day-enabled" style={{ marginRight: '10px' }}>
                  <input
                    type="checkbox"
                    checked={calendarStatus.syncEnabled}
                    onChange={(e) => void handleToggleSync(e.target.checked)}
                  />
                  <span>Sync appointments</span>
                </label>
                <button
                  type="button"
                  className="calendar-sync-btn-test"
                  onClick={() => void handleTestSync()}
                  disabled={testingSync}
                  title="Test that Google Calendar API is enabled and active"
                >
                  {testingSync ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}
                  {testingSync ? 'Testing…' : 'Test Sync'}
                </button>
                <button
                  type="button"
                  className="calendar-sync-btn-disconnect"
                  onClick={() => void handleDisconnectCalendar()}
                >
                  <Unlink size={14} /> Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                className="calendar-sync-btn-connect"
                onClick={() => void handleConnectCalendar()}
                disabled={connectingCalendar || calendarStatus?.configured === false}
              >
                {connectingCalendar ? <LoaderCircle className="spin" size={15} /> : <ExternalLink size={15} />}
                {connectingCalendar ? 'Connecting…' : 'Connect Google Calendar'}
              </button>
            )}
          </div>
        </div>

        {calendarNotice && (
          <div className={`calendar-notice-box ${calendarNotice.tone}`}>
            {calendarNotice.tone === 'error' ? <CircleAlert size={16} /> : <Check size={16} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span>{calendarNotice.text}</span>
              {diagnosticDetail && diagnosticDetail.startsWith('https://') && (
                <div>
                  <a
                    href={diagnosticDetail}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#1b1d1b',
                      color: '#f6f6f1',
                      padding: '7px 12px',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      marginTop: '4px',
                    }}
                  >
                    <ExternalLink size={13} /> 1-Click: Enable Google Calendar API in Google Cloud
                  </a>
                </div>
              )}
              {diagnosticDetail && !diagnosticDetail.startsWith('https://') && (
                <pre style={{ margin: '6px 0 0', padding: '8px', background: '#fff', border: '1px solid #dcded7', fontSize: '0.68rem', overflowX: 'auto', maxHeight: '160px' }}>
                  {diagnosticDetail}
                </pre>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="booking-link-row">
        <div>
          <span>
            <Link2 size={16} /> Your patient booking link
          </span>
          <input value={settings.bookingUrl} readOnly aria-label="Patient booking link" />
        </div>
        <CopyButton
          text={settings.bookingUrl}
          label="Copy link"
          copiedLabel="Link copied!"
          className="button button-secondary"
        />
        <button
          type="button"
          className="button button-primary"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}
          {saving ? 'Saving…' : 'Save availability'}
        </button>
      </div>
      {message && (
        <p className="booking-message">
          <Check size={16} /> {message}
        </p>
      )}
    </section>
  );
}
