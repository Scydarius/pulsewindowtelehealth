import { ArrowRight, ChartNoAxesCombined, LockKeyhole, ScanFace, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { organizationSchema, PublicFooter, PublicHeader, Seo } from '../components/PublicSite';
import { ClinicWebsitePage } from './ClinicWebsitePage';

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
  return <main className="ventricura-public home-v3"><Seo title="Ventricura | Contactless telehealth technology" description="Contactless rPPG technology for clinician-controlled telehealth and remote care." path="/" jsonLd={organizationSchema} />
    <PublicHeader />
    <section className="home-hero">
      <div className="home-hero-copy">
        <p className="home-overline">For clinician-led remote care</p>
        <h1>More context<br />for every <em>remote</em> consultation.</h1>
        <p>Ventricura combines secure video appointments with camera-based physiological signal capture in one clinician-controlled workflow.</p>
        <div className="public-actions"><Link to="/contact" className="dark-action">Talk to our team <ArrowRight size={17} /></Link><Link to="/demo" className="quiet-action">See the live demo</Link></div>
      </div>
      <div className="home-product-frame" aria-label="Illustration of the Ventricura clinician interface">
        <div className="product-frame-bar"><span>Consultation</span><span>Patient record</span><span>Readings</span></div>
        <div className="product-frame-content">
          <div className="product-patient-video"><div className="product-patient-shape"><i /><b /></div><div className="product-face-guide" /><span>Patient camera</span></div>
          <div className="product-reading-panel"><p>Live reading</p><strong>74 <small>BPM</small></strong><span>Stable signal</span><svg viewBox="0 0 264 86" aria-hidden="true"><path d="M0 44 L20 44 L31 31 L43 56 L58 15 L72 68 L86 42 L106 44 L121 44 L134 32 L147 55 L160 21 L174 65 L188 44 L264 44" /></svg><footer><span>30 second capture</span><span>Signal quality: good</span></footer></div>
        </div>
        <div className="product-frame-footer"><span><Video size={14} /> Video consultation</span><span><ChartNoAxesCombined size={14} /> Clinician view</span></div>
      </div>
    </section>
    <section className="home-capability-strip" aria-label="Platform capabilities"><span>Secure patient links</span><i /><span>Video consultations</span><i /><span>Live waveform review</span><i /><span>Patient history</span></section>
    <section className="home-story">
      <div className="home-story-intro"><p className="home-overline">A useful reading needs clinical context</p><h2>Built into the consultation, not bolted on afterwards.</h2></div>
      <div className="home-story-steps"><article><span>01</span><Video /><h3>Invite a patient</h3><p>Create an appointment or share a secure booking link without creating a patient account.</p></article><article><span>02</span><ScanFace /><h3>Run the consultation</h3><p>The patient joins from their browser while the clinician remains in control of the session.</p></article><article><span>03</span><ChartNoAxesCombined /><h3>Review in one place</h3><p>Readings, waveforms, notes and previous appointments remain attached to the patient record.</p></article></div>
    </section>
    <section className="home-workspace">
      <div className="home-workspace-copy"><p className="home-overline">The clinician workspace</p><h2>Less admin around the call. More continuity after it.</h2><p>Invite patients, manage appointments, review a reading, write follow-up notes and export a summary without moving between separate systems.</p><Link to={clinicianSignedIn ? '/clinician' : '/clinician/sign-in'} className="light-action">{clinicianSignedIn ? 'Open clinician workspace' : 'Clinician sign in'} <ArrowRight size={17} /></Link></div>
      <div className="home-workspace-list"><div><span>Patient</span><strong>Ramsay Stratford</strong><small>2 appointments · 1 reading to review</small></div><div><span>Next action</span><strong>Review latest session</strong><small>Captured today · 95 BPM</small></div><div><span>Record</span><strong>Notes &amp; waveform</strong><small>Private clinician workspace</small></div></div>
    </section>
    <section className="home-closing"><p>Designed in Adelaide for clinicians exploring a more capable remote-care workflow.</p><Link to="/contact">Start a conversation <ArrowRight size={17} /></Link></section>
    <PublicFooter />
  </main>;
}
