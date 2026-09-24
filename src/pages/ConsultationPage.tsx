import { ArrowLeft, Clock3, Pill, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { MeasurementPanel } from '../components/MeasurementPanel';
import { VideoRoom } from '../components/VideoRoom';

export function ConsultationPage() {
  const { appointmentId = 'demo' } = useParams();

  return (
    <div className="consultation-page">
      <div className="consultation-heading">
        <Link to="/patient" className="back-link"><ArrowLeft size={18} /> Leave consultation</Link>
        <div className="consultation-person"><div className="avatar"><UserRound size={19} /></div><div><strong>Medication follow-up</strong><span>Claire Williams with Dr Maya Patel</span></div></div>
        <div className="call-time"><span className="live-dot" /><Clock3 size={16} /> 00:00</div>
      </div>

      <div className="consultation-grid">
        <section className="video-column">
          <VideoRoom appointmentId={appointmentId} />
          <div className="medication-context"><div><Pill /></div><span><strong>Medication context</strong>Morning dose recorded at 8:00 am · measurement requested during consultation</span><button className="text-button">View care plan</button></div>
        </section>
        <MeasurementPanel />
      </div>
    </div>
  );
}
