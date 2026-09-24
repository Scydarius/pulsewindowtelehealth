import { ArrowRight, Camera, HeartPulse, ShieldCheck, Stethoscope, Video } from 'lucide-react';
import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="brand"><img src="/pulsewindow-mark.svg" alt="" /><span>PulseWindow</span></div>
        <span className="prototype-label">Research prototype</span>
      </header>

      <main className="landing-main">
        <section className="landing-copy">
          <p className="eyebrow">Telehealth with more context</p>
          <h1>See the patient.<br /><em>Measure the moment.</em></h1>
          <p className="landing-intro">PulseWindow brings video consultations and contactless vital-sign check-ins into one simple appointment.</p>

          <div className="role-grid">
            <Link to="/patient" className="role-card role-patient">
              <div className="role-icon"><HeartPulse /></div>
              <div><span>I am a patient</span><strong>View my care plan</strong></div>
              <ArrowRight />
            </Link>
            <Link to="/clinician" className="role-card">
              <div className="role-icon"><Stethoscope /></div>
              <div><span>I am a clinician</span><strong>Open clinician portal</strong></div>
              <ArrowRight />
            </Link>
          </div>

          <div className="trust-row">
            <span><ShieldCheck /> Private by design</span>
            <span><Camera /> Camera-based check</span>
            <span><Video /> Built for remote care</span>
          </div>
        </section>

        <section className="landing-visual" aria-label="PulseWindow consultation preview">
          <div className="visual-orb visual-orb-one" />
          <div className="visual-orb visual-orb-two" />
          <div className="consultation-preview">
            <div className="preview-top"><span>Consultation in progress</span><span className="live-chip">Live</span></div>
            <div className="preview-video">
              <div className="preview-person"><div className="person-head" /><div className="person-body" /></div>
              <div className="face-frame"><span /></div>
              <div className="doctor-tile"><div>MP</div><span>Dr Patel</span></div>
            </div>
            <div className="preview-reading">
              <div><HeartPulse /><span>Pulse</span><strong>72 <small>BPM</small></strong></div>
              <div className="signal-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">PulseWindow does not replace clinical judgement or emergency care.</footer>
    </div>
  );
}
