import { ArrowLeft, Clock3, Pill, UserRound, Video } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MeasurementPanel } from '../components/MeasurementPanel';
import { VideoRoom } from '../components/VideoRoom';

export function ConsultationPage() {
  const { appointmentId = 'demo' } = useParams();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') === 'clinician' ? 'clinician' : 'patient';
  const invitationToken = searchParams.get('invite') ?? undefined;
  const displayName = role === 'clinician' ? 'Clinician' : 'Patient';
  const dashboardPath = role === 'clinician' ? '/clinician' : '/join';

  return (
    <div className={`consultation-page ventricura-consultation ${role === 'clinician' ? 'clinician-consultation' : 'patient-consultation'}`}>
      <header className="consultation-heading consultation-toolbar">
        <Link to={dashboardPath} className="back-link"><ArrowLeft size={18} /> Leave consultation</Link>
        <div className="consultation-person"><div className="avatar"><UserRound size={19} /></div><div><strong>{role === 'clinician' ? 'Clinician workspace' : 'Patient appointment'}</strong><span>Secure video appointment</span></div></div>
        <div className="call-time"><span className="live-dot" /><Clock3 size={16} /> 00:00</div>
      </header>

      <main className={`consultation-grid consultation-workspace ${role === 'patient' ? 'patient-consultation-grid' : ''}`}>
        <section className="video-column consultation-video-panel">
          <div className="consultation-video-heading">
            <div><p className="eyebrow">Live room</p><h1>{role === 'clinician' ? 'Patient video' : 'Your video appointment'}</h1></div>
            <span><Video size={15} /> Connected room</span>
          </div>
          <VideoRoom appointmentId={appointmentId} displayName={displayName} role={role} invitationToken={invitationToken} />
          <div className="medication-context"><div><Pill /></div><span><strong>Appointment privacy</strong>This call is available only to the clinician and the holder of the secure patient link.</span></div>
        </section>
        <section className="consultation-measurements-panel">
          {role === 'patient' && <MeasurementPanel appointmentId={appointmentId} role={role} invitationToken={invitationToken} />}
          {role === 'clinician' && <MeasurementPanel appointmentId={appointmentId} role={role} invitationToken={invitationToken} />}
        </section>
      </main>
    </div>
  );
}
