import { ArrowRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { organizationSchema, PublicFooter, PublicHeader, Seo } from '../components/PublicSite';
import { ClinicWebsitePage } from './ClinicWebsitePage';
import '../styles/home-v4.css';

gsap.registerPlugin(ScrollTrigger);

function clinicSlugFromHost() {
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith('.ventricura.com')) return null;
  const slug = host.slice(0, -'.ventricura.com'.length);
  return slug && !['www', 'app'].includes(slug) ? slug : null;
}

const workflow = [
  ['01', 'A link with a purpose', 'Invite a patient directly or share a booking link. They join in a browser, with no patient account to manage.'],
  ['02', 'A consultation with context', 'Video consultation and contactless vitals on one screen—no separate devices or apps needed.'],
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

  useLayoutEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    const stage = story.querySelector<HTMLElement>('.v10-story-stage');
    const device = story.querySelector<HTMLElement>('.v10-device');
    const grid = story.querySelector<HTMLElement>('.v10-device-grid');
    const screens = gsap.utils.toArray<HTMLElement>('.v10-screen', story);
    const copies = gsap.utils.toArray<HTMLElement>('.v10-story-copy article', story);
    const progress = gsap.utils.toArray<HTMLElement>('.v10-story-progress i', story);
    if (!stage || !device || !grid || screens.length !== 3 || copies.length !== 3) return;

    const media = gsap.matchMedia();
    media.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
      let previousStep = 0;
      const context = gsap.context(() => {
        gsap.set([screens[1], screens[2], copies[1], copies[2]], { autoAlpha: 0, y: 34, scale: 0.985 });
        gsap.set([screens[0], copies[0]], { autoAlpha: 1, y: 0, scale: 1 });
        gsap.set(progress, { scaleX: 0.25, transformOrigin: 'left center' });
        gsap.set(progress[0], { scaleX: 1 });

        const timeline = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: story,
            start: 'top top',
            end: '+=220%',
            pin: stage,
            scrub: 0.45,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const nextStep = Math.min(2, Math.floor(self.progress * 3));
              if (nextStep !== previousStep) {
                previousStep = nextStep;
                setActiveStory(nextStep);
              }
            },
          },
        });

        timeline
          .to(device, { rotateX: -1.6, y: -10, duration: 0.18 }, 0)
          .to(grid, { y: -20, duration: 0.28 }, 0)
          .to([screens[0], copies[0]], { autoAlpha: 0, y: -30, duration: 0.12 }, 0.25)
          .to([screens[1], copies[1]], { autoAlpha: 1, y: 0, scale: 1, duration: 0.15 }, 0.33)
          .to(progress[1], { scaleX: 1, duration: 0.1 }, 0.4)
          .to(device, { rotateX: 1.2, y: 8, duration: 0.22 }, 0.5)
          .to([screens[1], copies[1]], { autoAlpha: 0, y: -30, duration: 0.12 }, 0.63)
          .to([screens[2], copies[2]], { autoAlpha: 1, y: 0, scale: 1, duration: 0.15 }, 0.71)
          .to(progress[2], { scaleX: 1, duration: 0.1 }, 0.77)
          .to(device, { rotateX: 0, y: 0, duration: 0.23 }, 0.8);
      }, story);
      return () => context.revert();
    });
    return () => media.revert();
  }, []);

  if (clinicSlug) return <ClinicWebsitePage slug={clinicSlug} />;

  return <main className="ventricura-public home-v6">
    <Seo title="Ventricura | Contactless telehealth technology" description="Contactless rPPG technology for clinician-controlled telehealth and remote care." path="/" jsonLd={organizationSchema} />
    <PublicHeader />

    <section className="v6-hero">
      <div className="v6-grid" aria-hidden="true" />
      <div className="v6-hero-copy">
        <p className="v6-kicker">Remote care should feel<br />enabling, not limiting.</p>
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
    </section>

    <section className="v6-manifesto"><p>Not another layer of telehealth.</p><h2>A single <em>platform</em><br />for all telehealth needs.</h2></section>

    <section className="v10-story" ref={storyRef} aria-label="A scrolling Ventricura workflow story">
      <div className="v10-story-stage">
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
            {workflow.map(([number, title, description], index) => <article key={number} className={activeStory === index ? 'active' : ''}><h2>{title}</h2><p>{description}</p><b>{index === 2 ? 'Record complete' : 'Scroll to continue'}</b></article>)}
          </div>
        </div>
        <div className="v10-story-progress" aria-hidden="true"><i className={activeStory >= 0 ? 'active' : ''} /><i className={activeStory >= 1 ? 'active' : ''} /><i className={activeStory >= 2 ? 'active' : ''} /></div>
      </div>
    </section>

    <section className="v6-workspace">
      <div className="v6-workspace-title"><h2>Less switching.<br /><em>More attention.</em></h2><p>Appointments, patient history, consultation notes and session review are designed to sit together—rather than get lost across separate tools.</p></div>
      <div className="v6-workspace-surface">
        <div className="v6-surface-bar"><span>VENTRICURA / CLINIC WORKSPACE</span><i>SECURE SESSION</i></div>
        <div className="v6-surface-main"><div><small>PATIENT HISTORY</small><strong>Every appointment.<br />One continuous record.</strong></div><ul><li><span>APPOINTMENT</span><b>Booking & access</b></li><li><span>CONSULTATION</span><b>Notes & video session</b></li><li><span>REVIEW</span><b>Waveform & PDF export</b></li></ul></div>
        <Link to={clinicianSignedIn ? '/clinician' : '/clinician/sign-in'}>{clinicianSignedIn ? 'Open clinician workspace' : 'Explore clinician access'} <ArrowRight size={17} /></Link>
      </div>
    </section>

    <section className="v6-demo">
      <h2>See contactless care<br /><em>in motion.</em></h2>
      <p>Experience how browser-based optical capture measures vitals in real time—with zero external devices or downloads required.</p>
      <Link to="/demo">Try the live demo <ArrowRight size={20} /></Link>
    </section>

    <section className="v6-close"><span>Ventricura is for practices ready to try a more connected way to consult remotely.</span><Link to="/contact">Start a clinic conversation <ArrowRight size={22} /></Link></section>
    <PublicFooter />
  </main>;
}
