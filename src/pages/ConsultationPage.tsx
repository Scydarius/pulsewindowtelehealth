import { ArrowLeft, Clock3, Pill, UserRound } from 'lucide-react';
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
    <div className="consultation-page">
      <div className="consultation-heading">
        <Link to={dashboardPath} className="back-link"><ArrowLeft size={18} /> Leave consultation</Link>
        <div className="consultation-person"><div className="avatar"><UserRound size={19} /></div><div><strong>Secure consultation</strong><span>Video appointment in progress</span></div></div>
        <div className="call-time"><span className="live-dot" /><Clock3 size={16} /> 00:00</div>
      </div>

      <div className={`consultation-grid ${role === 'patient' ? 'patient-consultation-grid' : ''}`}>
        <section className="video-column">
          <VideoRoom appointmentId={appointmentId} displayName={displayName} role={role} invitationToken={invitationToken} />
          <div className="medication-context"><div><Pill /></div><span><strong>Appointment privacy</strong>This call is available only to the clinician and the holder of the secure patient link.</span></div>
          {role === 'patient' && <MeasurementPanel appointmentId={appointmentId} role={role} invitationToken={invitationToken} />}
        </section>
        {role === 'clinician' && <MeasurementPanel appointmentId={appointmentId} role={role} invitationToken={invitationToken} />}
      </div>
    </div>
  );
}
