import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

const workflow = [
  ['01', 'A link with a purpose', 'Invite a patient directly or share a booking link. They join in a browser, with no patient account to manage.'],
  ['02', 'A consultation with context', 'Bring video, an optional camera capture and the patient’s reason for visit into one focused session.'],
  ['03', 'A record that stays useful', 'Keep notes, measurements, appointments and an exportable summary together after the call ends.'],
];

export function LandingPage() {
  const clinicSlug = clinicSlugFromHost();
  const [clinicianSignedIn, setClinicianSignedIn] = useState(false);
  const [activeStory, setActiveStory] = useState(0);
  const storyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: { session } }) => setClinicianSignedIn(Boolean(session)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setClinicianSignedIn(Boolean(session)));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    let frame = 0;
    const updateStory = () => {
      const bounds = story.getBoundingClientRect();
      const travel = Math.max(1, story.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -bounds.top / travel));
      story.style.setProperty('--story-progress', progress.toFixed(4));
      story.style.setProperty('--story-tilt', `${((.5 - progress) * 2).toFixed(3)}deg`);
      story.style.setProperty('--story-lift', `${((.5 - progress) * 22).toFixed(2)}px`);
      story.style.setProperty('--story-grid-y', `${(progress * -42).toFixed(2)}px`);
      story.style.setProperty('--story-caption-y', `${((.5 - progress) * 10).toFixed(2)}px`);
      story.style.setProperty('--story-step-shift', `${((progress - .5) * -12).toFixed(2)}px`);
      story.style.setProperty('--story-invite-x', `${(-progress * 840).toFixed(2)}px`);
      story.style.setProperty('--story-consult-x', `${(420 - progress * 840).toFixed(2)}px`);
      story.style.setProperty('--story-record-x', `${(840 - progress * 840).toFixed(2)}px`);
      const nextStage = Math.min(2, Math.floor(progress * 3));
      setActiveStory((current) => current === nextStage ? current : nextStage);
      frame = 0;
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateStory);
    };
    updateStory();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  if (clinicSlug) return <ClinicWebsitePage slug={clinicSlug} />;

  return <main className="ventricura-public home-v6">
    <Seo title="Ventricura | Contactless telehealth technology" description="Contactless rPPG technology for clinician-controlled telehealth and remote care." path="/" jsonLd={organizationSchema} />
    <PublicHeader />

    <section className="v6-hero">
      <div className="v6-grid" aria-hidden="true" />
      <div className="v6-hero-meta"><span>VENTRICURA / 01</span><span>CLINICAL TELEPRESENCE</span><span>ADELAIDE, AU</span></div>
      <div className="v6-hero-copy">
        <p className="v6-kicker">Remote care should feel<br />closer, not smaller.</p>
        <h1>PATIENT CARE,<br />WITHOUT THE<br /><em>EXTRA SYSTEMS.</em></h1>
        <p className="v6-intro">Ventricura is a clinician-led telehealth workspace for the parts of care that happen before, during and after a video call.</p>
        <div className="v6-actions"><Link to="/contact">Talk to our team <ArrowRight size={17} /></Link><Link to="/demo">Open live demo <ArrowRight size={17} /></Link></div>
      </div>
      <aside className="v6-signal-module" aria-label="An illustrative live remote-care signal">
        <div className="v6-module-head"><span>CONSULTATION / LIVE</span><b>◉ ONLINE</b></div>
        <div className="v6-scope">
          <div className="v6-scope-ring v6-scope-ring-a" /><div className="v6-scope-ring v6-scope-ring-b" /><div className="v6-scope-core">V</div>
          <svg viewBox="0 0 360 90" aria-hidden="true"><path d="M0 48 H38 L54 39 L70 58 L95 18 L118 72 L143 47 H178 L202 42 L220 55 L243 26 L265 67 L291 47 H360" /></svg>
        </div>
        <div className="v6-module-data"><span><i />PATIENT LINK</span><span><i />VIDEO ROOM</span><span><i />RECORD READY</span></div>
      </aside>
      <div className="v6-hero-bottom"><span>ONE LINK FOR THE PATIENT</span><span>ONE PROTECTED WORKSPACE FOR THE CLINIC</span><b>SCROLL TO ENTER ↓</b></div>
    </section>

    <section className="v6-manifesto"><p>Not another layer of telehealth.</p><h2>A single <em>clinical surface</em><br />for the whole conversation.</h2><span>01 / THE POINT</span></section>

    <section className="v10-story" ref={storyRef} aria-label="A scrolling Ventricura workflow story">
      <div className="v10-story-sticky">
        <div className="v10-story-meta"><span>02 / THE FLOW</span><span>{`0${activeStory + 1} / 03`}</span></div>
        <div className="v10-story-frame">
          <div className="v10-device" data-active-stage={activeStory}>
            <div className="v10-device-bar"><span>VENTRICURA / SESSION</span><i>LIVE WORKFLOW</i></div>
            <div className="v10-device-grid" aria-hidden="true" />
            <div className="v10-screen v10-screen-invite"><span>SECURE LINK</span><strong>Patient access,<br />kept simple.</strong><div className="v10-link-line"><i />VENTRICURA.COM/JOIN/••••</div></div>
            <div className="v10-screen v10-screen-consult"><span>LIVE CONSULTATION</span><strong>Everything in<br />the same room.</strong><svg viewBox="0 0 310 62" aria-hidden="true"><path d="M0 32H41l14-12 16 24L98 6l27 51 27-25h40l18-13 17 25 26-38 24 46 18-20h35" /></svg></div>
            <div className="v10-screen v10-screen-record"><span>SESSION RECORD</span><strong>Ready for<br />what comes next.</strong><div className="v10-record-lines"><i /><i /><i /></div></div>
            <div className="v10-device-status"><span><i />PATIENT LINK</span><span><i />VIDEO</span><span><i />RECORD</span></div>
          </div>
          <div className="v10-story-copy">
            {workflow.map(([number, title, description], index) => <article key={number} className={activeStory === index ? 'active' : ''}><span>{number} / 03</span><h2>{title}</h2><p>{description}</p><b>{index === 2 ? 'Record complete' : 'Scroll to continue'}</b></article>)}
          </div>
        </div>
        <div className="v10-story-progress" aria-hidden="true"><i className={activeStory >= 0 ? 'active' : ''} /><i className={activeStory >= 1 ? 'active' : ''} /><i className={activeStory >= 2 ? 'active' : ''} /></div>
      </div>
    </section>

    <section className="v6-workspace">
      <div className="v6-workspace-title"><span>03 / THE WORKSPACE</span><h2>Less switching.<br /><em>More attention.</em></h2><p>Appointments, patient history, consultation notes and session review are designed to sit together—rather than get lost across separate tools.</p></div>
      <div className="v6-workspace-surface">
        <div className="v6-surface-bar"><span>VENTRICURA / CLINIC WORKSPACE</span><i>SECURE SESSION</i></div>
        <div className="v6-surface-main"><div><small>PATIENT HISTORY</small><strong>Every appointment.<br />One continuous record.</strong></div><ul><li><span>APPOINTMENT</span><b>Booking & access</b></li><li><span>CONSULTATION</span><b>Notes & video session</b></li><li><span>REVIEW</span><b>Waveform & PDF export</b></li></ul></div>
        <Link to={clinicianSignedIn ? '/clinician' : '/clinician/sign-in'}>{clinicianSignedIn ? 'Open clinician workspace' : 'Explore clinician access'} <ArrowRight size={17} /></Link>
      </div>
    </section>

    <section className="v6-demo"><span>LIVE CAPTURE / 04</span><h2>Your camera.<br /><em>The actual flow.</em></h2><p>The public demo uses the same live signal-processing pathway as Ventricura. Nothing from the demo is retained.</p><Link to="/demo">Try the live demo <ArrowRight size={20} /></Link></section>

    <section className="v6-close"><span>Ventricura is for practices ready to try a more connected way to consult remotely.</span><Link to="/contact">Start a clinic conversation <ArrowRight size={22} /></Link></section>
    <PublicFooter />
  </main>;
}
