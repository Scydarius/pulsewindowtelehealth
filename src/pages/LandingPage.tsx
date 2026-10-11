import { ArrowDownRight, ArrowRight, CalendarDays, FileCheck2, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { organizationSchema, PublicFooter, PublicHeader, Seo } from '../components/PublicSite';
import { ClinicWebsitePage } from './ClinicWebsitePage';
import '../styles/home-v4.css';

function clinicSlugFromHost() {
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith('.ventricura.com')) return null;
  const slug = host.slice(0, -'.ventricura.com'.length);
  return slug && !['www', 'app'].includes(slug) ? slug : null;
}

function SignalLine() {
  return <svg className="signal-line" viewBox="0 0 736 190" fill="none" aria-hidden="true">
    <path d="M0 104H70l17-7 15 13 22-41 19 86 22-112 22 96 18-42 21 7h56l15-8 17 14 20-38 22 79 20-108 24 99 18-44 22 7h53l19-9 18 15 20-39 22 78 19-108 24 100 17-44 24 7h62" />
  </svg>;
}

export function LandingPage() {
  const clinicSlug = clinicSlugFromHost();
  const [clinicianSignedIn, setClinicianSignedIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: { session } }) => setClinicianSignedIn(Boolean(session)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setClinicianSignedIn(Boolean(session)));
    return () => subscription.unsubscribe();
  }, []);

  if (clinicSlug) return <ClinicWebsitePage slug={clinicSlug} />;

  return <main className="ventricura-public home-v4">
    <Seo title="Ventricura | Contactless telehealth technology" description="Contactless rPPG technology for clinician-controlled telehealth and remote care." path="/" jsonLd={organizationSchema} />
    <PublicHeader />
    <section className="v4-hero">
      <div className="v4-hero-copy">
        <p className="v4-index">( 01 — Remote care, made more present )</p>
        <h1>Care doesn’t stop<br />at the <i>screen.</i></h1>
        <p className="v4-lede">A clinician-led telehealth workspace that brings appointments, camera-based readings and follow-up into one considered flow.</p>
        <div className="v4-actions"><Link to="/contact" className="v4-action-primary">Start a conversation <ArrowRight size={17} /></Link><Link to="/demo" className="v4-action-text">Try the live demo <ArrowDownRight size={18} /></Link></div>
      </div>
      <div className="v4-signal-stage" aria-label="A live Ventricura consultation illustration">
        <div className="v4-stage-label"><span className="v4-live-dot" /> live consultation <b>01:24</b></div>
        <div className="v4-orbit v4-orbit-one" /><div className="v4-orbit v4-orbit-two" />
        <div className="v4-face-window"><div className="v4-face"><span /><i /></div><div className="v4-detection-frame" /></div>
        <div className="v4-reading-card"><span>Pulse rate</span><strong>74 <small>bpm</small></strong><em>signal acquired</em><SignalLine /></div>
        <div className="v4-stage-caption">Camera signal → clinician context</div>
      </div>
    </section>
    <div className="v4-ticker" aria-label="Ventricura platform capabilities"><div><span>Video consultations</span><i /> <span>Secure patient links</span><i /> <span>Waveform review</span><i /> <span>Clinician-controlled records</span><i /> <span>Video consultations</span><i /> <span>Secure patient links</span></div></div>
    <section className="v4-manifesto"><p className="v4-index">( 02 — Built around a real consultation )</p><div><h2>A reading is only useful when it belongs to the <i>right moment.</i></h2><p>Ventricura is designed so a clinician can invite, observe and document without pulling patients through another account or another app.</p></div></section>
    <section className="v4-flow" aria-label="The Ventricura clinical flow">
      <article className="v4-flow-intro"><span>The flow</span><h2>One link.<br />One call.<br /><i>One record.</i></h2><p>Every part of the session stays connected—before, during and after the appointment.</p></article>
      <article className="v4-flow-step"><span>01</span><div className="v4-step-icon"><CalendarDays size={22} /></div><h3>Invite</h3><p>Send a secure appointment or booking link. No patient sign-up is required.</p><b>Before the call</b></article>
      <article className="v4-flow-step"><span>02</span><div className="v4-step-icon"><Video size={22} /></div><h3>Consult</h3><p>Join a browser-based video session and capture a camera signal when it is useful.</p><b>In the room</b></article>
      <article className="v4-flow-step"><span>03</span><div className="v4-step-icon"><FileCheck2 size={22} /></div><h3>Continue care</h3><p>Review the waveform, notes and previous sessions from the same patient record.</p><b>After the call</b></article>
    </section>
    <section className="v4-product">
      <div className="v4-product-copy"><p className="v4-index">( 03 — The clinician’s side of the screen )</p><h2>Less tab switching.<br /><i>More clinical continuity.</i></h2><p>Appointments, patient notes, readings and follow-up live together in one private workspace—built for the people responsible for care.</p><Link to={clinicianSignedIn ? '/clinician' : '/clinician/sign-in'} className="v4-outline-link">{clinicianSignedIn ? 'Open clinician workspace' : 'Explore clinician access'} <ArrowRight size={17} /></Link></div>
      <div className="v4-workspace-preview" aria-label="Illustration of a clinician patient record"><header><span>Ventricura / workspace</span><span>Ramsay Stratford</span></header><div className="v4-workspace-main"><aside><span>Patient record</span><strong>Ramsay<br />Stratford</strong><small>Last session · today</small><div className="v4-avatar-mark">RS</div></aside><div className="v4-workspace-data"><div className="v4-data-top"><span>Latest session</span><b>Ready for review</b></div><div className="v4-data-reading"><span>Pulse rate</span><strong>74<small> BPM</small></strong><SignalLine /></div><div className="v4-data-meta"><span>Notes</span><span>Waveform</span><span>Summary</span></div></div></div><footer><span>Patient history</span><span>2 appointments</span><span>1 reading</span></footer></div>
    </section>
    <section className="v4-closing"><div><p className="v4-index">( 04 — Built in Adelaide )</p><h2>Let’s make telehealth feel a little less distant.</h2></div><Link to="/contact">Talk to Ventricura <ArrowRight size={22} /></Link></section>
    <PublicFooter />
  </main>;
}
