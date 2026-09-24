import { ArrowRight, Camera, ShieldCheck, Stethoscope, Video } from 'lucide-react';
import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="brand"><img src="/pulsewindow-mark.svg" alt="" /><span>PulseWindow</span></div>
        <span className="prototype-label">Secure telehealth workspace</span>
      </header>

      <main className="landing-main">
        <section className="landing-copy">
          <p className="eyebrow">Telehealth with more context</p>
          <h1>See the patient.<br /><em>Measure the moment.</em></h1>
          <p className="landing-intro">PulseWindow brings secure video consultations and contactless wellbeing checks into one simple appointment.</p>

          <div className="role-grid">
            <Link to="/clinician/sign-in" className="role-card">
              <div className="role-icon"><Stethoscope /></div>
              <div><span>For clinicians</span><strong>Sign in to your workspace</strong></div>
              <ArrowRight />
            </Link>
            <div className="role-card role-patient">
              <div className="role-icon"><Video /></div>
              <div><span>For patients</span><strong>Join using your secure link</strong></div>
            </div>
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
              <div className="doctor-tile"><div><ShieldCheck /></div><span>Secure call</span></div>
            </div>
            <div className="preview-reading">
              <div><ShieldCheck /><span>Private appointment</span><strong>Ready</strong></div>
              <div className="signal-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">PulseWindow does not replace clinical judgement or emergency care.</footer>
    </div>
  );
}
