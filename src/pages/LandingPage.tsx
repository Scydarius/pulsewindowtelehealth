import { ArrowRight } from 'lucide-react';
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

  return <main className="ventricura-public home-v5">
    <Seo title="Ventricura | Contactless telehealth technology" description="Contactless rPPG technology for clinician-controlled telehealth and remote care." path="/" jsonLd={organizationSchema} />
    <PublicHeader />

    <section className="v5-hero">
      <div className="v5-hero-top"><span>Ventricura / Adelaide</span><span>01 — Remote care, in sequence</span></div>
      <div className="v5-hero-headline">
        <div>
          <p className="v5-hero-label">Telehealth, with a<br />clinical throughline.</p>
          <h1>Care that<br /><em>continues</em><br />past the call.</h1>
        </div>
        <aside className="v5-pathway" aria-label="A simple consultation pathway">
          <div className="v5-pathway-head"><span>Appointment pathway</span><b>LIVE / 01</b></div>
          <div className="v5-pathway-line" aria-hidden="true"><i /><i /><i /></div>
          <ol><li><span>01</span><b>Invite</b><small>Secure browser link</small></li><li><span>02</span><b>Consult</b><small>Video & guided capture</small></li><li><span>03</span><b>Continue</b><small>Record & follow-up</small></li></ol>
        </aside>
      </div>
      <div className="v5-hero-foot"><Link to="/contact">Talk to our team <ArrowRight size={17} /></Link><Link to="/demo">Open the live demo <ArrowRight size={17} /></Link><span>One browser link for patients. One protected workspace for clinicians.</span></div>
    </section>

    <section className="v5-statement"><p>Remote care often fractures into booking systems, video tools and follow-up notes.</p><h2>We’re building the bit that <em>keeps it together.</em></h2></section>

    <section className="v5-sequence" aria-label="The Ventricura workflow">
      <header><span>How it works</span><p>A connected pathway for the appointment—not a new patient app.</p></header>
      <article><span>Before</span><div><h3>Make the appointment simple.</h3><p>Invite a patient directly or share a booking link. They open it in their browser, with no account to create.</p></div><b>01</b></article>
      <article><span>During</span><div><h3>Keep the clinician in the room.</h3><p>Meet by video. When useful, the clinician can start a guided camera capture from the same session.</p></div><b>02</b></article>
      <article><span>After</span><div><h3>Leave with a record, not a loose end.</h3><p>Readings, notes, previous appointments and exportable summaries stay with the patient record.</p></div><b>03</b></article>
    </section>

    <section className="v5-record">
      <div className="v5-record-title"><span>Inside the workspace</span><h2>Everything a clinician needs<br />is <em>part of the record.</em></h2></div>
      <div className="v5-record-list"><article><span>Appointments</span><p>Schedule, send a patient link, join a consultation and resend access when needed.</p></article><article><span>Patient history</span><p>Keep consultations, notes and previous readings together under the same patient.</p></article><article><span>Session review</span><p>Review a waveform, document follow-up and export a concise PDF summary.</p></article></div>
      <Link to={clinicianSignedIn ? '/clinician' : '/clinician/sign-in'} className="v5-workspace-link">{clinicianSignedIn ? 'Open clinician workspace' : 'Explore clinician access'} <ArrowRight size={17} /></Link>
    </section>

    <section className="v5-demo-block"><div><span>See it in action</span><h2>Use your own camera.<br />See the live flow.</h2></div><p>The public demo connects to the same live signal-processing path used by Ventricura. Nothing is saved from the demo.</p><Link to="/demo">Try the live demo <ArrowRight size={18} /></Link></section>

    <section className="v5-close"><p>For practices and clinicians exploring a more connected approach to remote consultations.</p><Link to="/contact">Start a conversation <ArrowRight size={20} /></Link></section>
    <PublicFooter />
  </main>;
}
