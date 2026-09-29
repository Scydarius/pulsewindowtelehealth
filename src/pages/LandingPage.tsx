import { ArrowRight, ChartNoAxesCombined, LockKeyhole, ScanFace, ShieldCheck, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { PublicHeader } from './TechnologyPage';

export function LandingPage() {
  const [clinicianSignedIn, setClinicianSignedIn] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: { session } }) => setClinicianSignedIn(Boolean(session)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setClinicianSignedIn(Boolean(session)));
    return () => subscription.unsubscribe();
  }, []);

  return <main className="ventricura-public home-v2">
    <PublicHeader />
    <section className="v-hero">
      <div className="v-hero-copy"><p className="mono-kicker">TELEHEALTH, WITH SIGNAL CONTEXT</p><h1>Care that sees<br /><em>a little deeper.</em></h1><p>Ventricura brings secure video consultations and camera-based physiological signal research into one focused clinical workflow.</p><div className="public-actions"><Link to="/technology" className="dark-action">Explore the technology <ArrowRight size={17} /></Link><Link to="/demo" className="quiet-action">Try the live demo</Link></div><div className="hero-facts"><span><i />Secure appointments</span><span><i />Clinician-controlled</span><span><i />Research technology</span></div></div>
      <div className="v-hero-console" aria-label="Illustration of the Ventricura clinician interface"><div className="console-top"><span>VENTRICURA / LIVE APPOINTMENT</span><i>SECURE</i></div><div className="console-body"><div className="console-camera"><div className="camera-person"><i /><b /></div><div className="scan-oval" /><span>Patient camera</span></div><div className="console-signal"><p>LIVE SIGNAL</p><strong>74<em>BPM</em></strong><small>Stable optical readout</small><svg viewBox="0 0 270 92" aria-hidden="true"><path d="M0 47 L18 47 L28 36 L40 59 L53 19 L67 72 L81 44 L102 47 L118 47 L131 34 L144 58 L156 25 L169 68 L183 47 L270 47" /></svg><footer><span>30s window</span><span>Signal locked</span></footer></div></div><div className="console-footer"><span><Video size={14} /> Consultation active</span><span><ChartNoAxesCombined size={14} /> Clinician view</span></div></div>
    </section>
    <section className="v-marquee"><span>REMOTE CARE</span><i /> <span>OPTICAL SIGNALS</span><i /> <span>CLINICIAN CONTEXT</span><i /> <span>SECURE BY DESIGN</span></section>
    <section className="v-workflow"><div className="section-caption"><p className="mono-kicker">A CONNECTED CLINICAL FLOW</p><h2>Built around the consultation, not around another device.</h2></div><div className="v-workflow-grid"><article><span>01</span><Video /><h3>Invite</h3><p>The clinician creates a patient appointment and shares a secure, single-purpose link.</p></article><article><span>02</span><ScanFace /><h3>Guide</h3><p>The patient joins the video call and completes a clear camera check when asked.</p></article><article><span>03</span><ChartNoAxesCombined /><h3>Review</h3><p>The clinician receives signal context, trends, and saved session information in their workspace.</p></article><article><span>04</span><LockKeyhole /><h3>Continue</h3><p>Patient history and private clinician notes stay connected to the care relationship.</p></article></div></section>
    <section className="v-split"><div><p className="mono-kicker">FOR CLINICIANS</p><h2>A proper workspace for remote appointments.</h2><p>Manage patients, issue secure links, join consultations, review measurement trends, export records, and write private follow-up notes.</p><Link to={clinicianSignedIn ? '/clinician' : '/clinician/sign-in'} className="dark-action">{clinicianSignedIn ? 'Open clinician workspace' : 'Clinician sign in'} <ArrowRight size={17} /></Link></div><aside><span>CLINICIAN WORKSPACE</span><div><strong>Patient history</strong><i /><strong>Live waveform</strong><i /><strong>Private notes</strong><i /><strong>CSV export</strong></div></aside></section>
    <section className="v-safety"><ShieldCheck /><div><strong>Designed to support, not replace, clinical judgement.</strong><p>Ventricura’s optical measurements are research technology. They are not intended for diagnosis, emergency assessment, or replacing validated clinical devices.</p></div></section>
    <footer className="public-footer"><img src="/ventricura-logo-centred.png" alt="Ventricura" /><span>Secure telehealth and rPPG research technology.</span></footer>
  </main>;
}
