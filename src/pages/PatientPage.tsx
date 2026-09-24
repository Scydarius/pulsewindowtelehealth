import { ArrowRight, CalendarDays, Camera, CheckCircle2, Clock3, HeartPulse, Pill, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MeasurementHistory } from '../components/MeasurementHistory';
import { nextAppointment } from '../data/mockData';

export function PatientPage() {
  return (
    <div className="dashboard-page">
      <section className="page-intro">
        <div><p className="eyebrow">Wednesday, 24 September</p><h1>Good morning, Claire.</h1><p>Here is what is coming up in your care plan.</p></div>
        <div className="support-note"><CheckCircle2 /><span><strong>Everything is ready</strong>Your camera and microphone will be checked before the call.</span></div>
      </section>

      <section className="patient-grid">
        <article className="next-appointment" id="appointments">
          <div className="appointment-top">
            <span className="appointment-label"><Video size={17} /> Next video appointment</span>
            <span className="ready-badge">Ready to join</span>
          </div>
          <div className="appointment-content">
            <div className="date-block"><strong>24</strong><span>SEP</span></div>
            <div className="appointment-details">
              <h2>{nextAppointment.reason}</h2>
              <p>with {nextAppointment.clinician}</p>
              <div><span><Clock3 /> {nextAppointment.timeLabel}</span><span><CalendarDays /> About 30 minutes</span></div>
            </div>
          </div>
          <Link to={`/consultation/${nextAppointment.id}`} className="button button-light">Join consultation <ArrowRight size={18} /></Link>
        </article>

        <article className="panel care-plan-card">
          <p className="eyebrow">Today’s care plan</p>
          <h2>Your next check-in</h2>
          <div className="care-step"><div><Pill /></div><span><strong>Morning medication</strong>Recorded at 8:00 am</span><CheckCircle2 className="step-complete" /></div>
          <div className="care-connector" />
          <div className="care-step current"><div><Camera /></div><span><strong>Pulse check</strong>During today’s appointment</span></div>
          <p className="care-explanation">Your clinician requested this check to understand how your pulse changes around your medication.</p>
        </article>
      </section>

      <section className="quick-actions">
        <article><div className="quick-icon"><Camera /></div><div><p className="eyebrow">Practice first</p><h3>Check your camera setup</h3><p>Test your lighting and positioning before the appointment.</p></div><button className="text-button">Start check <ArrowRight size={16} /></button></article>
        <article><div className="quick-icon coral"><HeartPulse /></div><div><p className="eyebrow">Need help?</p><h3>Understanding your readings</h3><p>See what PulseWindow measures and what the results mean.</p></div><button className="text-button">Learn more <ArrowRight size={16} /></button></article>
      </section>

      <MeasurementHistory />
    </div>
  );
}
