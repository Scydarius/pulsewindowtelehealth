import { ArrowRight, Binary, Camera, ChartNoAxesCombined, LockKeyhole, ScanFace, ShieldCheck, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PublicFooter, Seo } from '../components/PublicSite';

export function TechnologyPage() {
  return <main className="ventricura-public technology-page"><Seo title="Contactless rPPG technology | Ventricura" description="How Ventricura connects guided camera checks, rPPG research telemetry, and clinician review in a telehealth workflow." path="/technology" />
    <PublicHeader />
    <section className="technology-hero">
      <div>
        <p className="mono-kicker">VENTRICURA SIGNAL SYSTEM</p>
        <h1>Remote care, with a clearer signal.</h1>
        <p>Ventricura connects a guided camera check, secure telehealth consultation, and clinician-facing signal context in one workflow.</p>
        <div className="public-actions"><Link to="/demo" className="dark-action">Open live demo <ArrowRight size={17} /></Link><Link to="/clinician/sign-in" className="quiet-action">Clinician sign in</Link></div>
      </div>
      <div className="technology-orbit" aria-label="A stylised representation of a camera signal becoming a waveform"><i /><i /><i /><div className="orbit-core"><Waves /><span>rPPG</span></div><span className="orbit-tag tag-one">CAMERA INPUT</span><span className="orbit-tag tag-two">SIGNAL PIPELINE</span><span className="orbit-tag tag-three">CLINICIAN VIEW</span></div>
    </section>

    <section className="technology-grid-wrap">
      <div className="section-caption"><p className="mono-kicker">HOW IT FITS TOGETHER</p><h2>One appointment. One secure flow.</h2><p>Camera frames are used during a short live session to produce an optical signal. The clinician sees the contextual result and waveform during the consultation.</p></div>
      <div className="technology-grid">
        <article><span>01</span><Camera /><h3>Guided capture</h3><p>The patient joins from a secure appointment link and follows the on-screen camera guide.</p></article>
        <article><span>02</span><ScanFace /><h3>Signal extraction</h3><p>Facial regions are tracked while the server derives a time-varying optical signal.</p></article>
        <article><span>03</span><Binary /><h3>Live processing</h3><p>The signal engine streams its readout, waveform, and processing context to the active session.</p></article>
        <article><span>04</span><ChartNoAxesCombined /><h3>Clinician review</h3><p>Clinicians can review the result, trend, waveform, and patient history inside their workspace.</p></article>
      </div>
    </section>

    <section className="signal-explainer">
      <div className="signal-explainer-copy"><p className="mono-kicker">REMOTE PHOTOPLETHYSMOGRAPHY</p><h2>Small optical changes.<br />A more useful view.</h2><p>rPPG analyses subtle changes in reflected light from the face. Ventricura presents this as research telemetry and consultation context—not a diagnosis or a substitute for validated clinical devices.</p></div>
      <div className="signal-sequence" aria-label="Signal processing sequence"><div><span>INPUT</span><strong>Video frames</strong><i /></div><b>→</b><div><span>EXTRACT</span><strong>Skin regions</strong><i /></div><b>→</b><div><span>ANALYSE</span><strong>Optical waveform</strong><i /></div><b>→</b><div><span>REVIEW</span><strong>Clinical context</strong><i /></div></div>
    </section>

    <section className="public-trust-strip"><ShieldCheck /><div><strong>Purpose-built for a secure appointment flow</strong><span>Short-lived signal sessions, clinician-controlled access, and patient links designed for a single consultation.</span></div><LockKeyhole /></section>
    <PublicFooter />
  </main>;
}

export function PublicHeader() {
  return <header className="public-header">
    <Link to="/" className="public-brand" aria-label="Ventricura home"><img src="/ventricura-logo-centred.png" alt="Ventricura" /></Link>
    <nav aria-label="Public navigation"><Link to="/technology">Technology</Link><Link to="/clinicians">For clinicians</Link><Link to="/demo">Live demo</Link><Link to="/contact">Contact</Link><Link to="/clinician/sign-in" className="header-access">Clinician access <ArrowRight size={15} /></Link></nav>
  </header>;
}
