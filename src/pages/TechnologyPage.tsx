import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from 'react-router-dom';
import { PublicFooter, PublicHeader, Seo } from '../components/PublicSite';

const signalSteps = [
  ['01', 'Camera input', 'A patient joins a secure appointment link and follows a simple on-screen guide.'],
  ['02', 'Signal forming', 'Subtle changes in reflected light are organised into a live optical waveform.'],
  ['03', 'Clinical context', 'The clinician sees the signal in the same workspace as the consultation and record.'],
] as const;

gsap.registerPlugin(ScrollTrigger);

function LegacySignalStory() {
  const [activeStep, setActiveStep] = useState(0);
  const storyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    let frame = 0;
    const update = () => {
      const bounds = story.getBoundingClientRect();
      const travel = Math.max(1, story.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -bounds.top / travel));
      story.style.setProperty('--signal-progress', progress.toFixed(4));
      story.style.setProperty('--signal-tilt', `${((.5 - progress) * 2).toFixed(3)}deg`);
      story.style.setProperty('--signal-lift', `${((.5 - progress) * 18).toFixed(2)}px`);
      story.style.setProperty('--signal-grid-y', `${(progress * -48).toFixed(2)}px`);
      story.style.setProperty('--signal-camera-x', `${(progress * -195).toFixed(2)}px`);
      story.style.setProperty('--signal-record-x', `${(progress * 195).toFixed(2)}px`);
      story.style.setProperty('--signal-wave-x', `${(progress * 22).toFixed(2)}px`);
      story.style.setProperty('--signal-wave-scale', `${(.15 + progress * .85).toFixed(4)}`);
      story.style.setProperty('--signal-camera-scale', `${(1 - progress * .2).toFixed(4)}`);
      story.style.setProperty('--signal-record-scale', `${(.7 + progress * .3).toFixed(4)}`);
      story.style.setProperty('--signal-wave-offset', `${(840 - progress * 840).toFixed(2)}`);
      story.style.setProperty('--signal-step-shift', `${((progress - .5) * -12).toFixed(2)}px`);
      story.style.setProperty('--signal-particle-opacity', `${Math.min(1, progress * 1.2).toFixed(3)}`);
      const stage = Math.min(signalSteps.length - 1, Math.floor(progress * signalSteps.length));
      setActiveStep((current) => current === stage ? current : stage);
      frame = 0;
    };
    const requestUpdate = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <section className="v12-signal-story" ref={storyRef} aria-label="How the Ventricura signal moves through a consultation">
    <div className="v12-signal-sticky">
      <div className="v12-signal-heading"><span>SIGNAL PATH</span><span>{`${signalSteps[activeStep][0]} / 03`}</span></div>
      <div className="v12-signal-machine">
        <div className="v12-machine-grid" aria-hidden="true" />
        <div className="v12-machine-topline"><span>VENTRICURA / SIGNAL SESSION</span><b>LIVE</b></div>
        <div className="v12-camera-card"><span>CAMERA / LIVE</span><div className="v12-camera-preview"><i className="v12-frame top-left" /><i className="v12-frame top-right" /><i className="v12-frame bottom-left" /><i className="v12-frame bottom-right" /><div className="v12-person"><i /><b /></div><em /></div><small><b /> FACE TRACKED</small></div>
        <div className="v12-signal-particles" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--particle': index } as React.CSSProperties} />)}</div>
        <svg className="v12-waveform" viewBox="0 0 620 190" aria-hidden="true"><path d="M0 102h58l30-25 35 53 58-103 58 143 58-70 57 5 35-27 35 58 51-98 54 104 42-40h68" /></svg>
        <div className="v12-record-card"><span>SESSION RECORD</span><div className="v12-record-patient"><i>RS</i><b>Ramsay S.</b><small>Signal ready</small></div><strong>74 <em>BPM</em></strong><svg viewBox="0 0 126 34" aria-hidden="true"><path d="M0 20h19l8-8 9 16 14-25 14 29 14-15 13 2 8-6 9 12 10-17 8 13h10" /></svg><i /><i /><small>REVIEW READY</small></div>
        <div className="v12-machine-footer"><span>INPUT</span><span>OPTICAL SIGNAL</span><span>CLINICIAN VIEW</span></div>
      </div>
      <div className="v12-signal-copy"><h2>{signalSteps[activeStep][1]}</h2><p>{signalSteps[activeStep][2]}</p></div>
    </div>
    <div className="v12-signal-steps">{signalSteps.map(([number, title, text], index) => <article key={number} className={activeStep === index ? 'active' : ''}><span>{number}</span><h3>{title}</h3><p>{text}</p><b>{activeStep === index ? 'In view' : 'Keep scrolling'}</b></article>)}</div>
  </section>;
}

function SignalStory() {
  const [activeStep, setActiveStep] = useState(0);
  const storyRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    const stage = story.querySelector<HTMLElement>('.v12-signal-sticky');
    const machine = story.querySelector<HTMLElement>('.v12-signal-machine');
    const grid = story.querySelector<HTMLElement>('.v12-machine-grid');
    const camera = story.querySelector<HTMLElement>('.v12-camera-card');
    const record = story.querySelector<HTMLElement>('.v12-record-card');
    const waveform = story.querySelector<SVGElement>('.v12-waveform');
    const particles = gsap.utils.toArray<HTMLElement>('.v12-signal-particles i', story);
    const copies = gsap.utils.toArray<HTMLElement>('.v12-signal-copy article', story);
    if (!stage || !machine || !grid || !camera || !record || !waveform || copies.length !== 3) return;

    const media = gsap.matchMedia();
    media.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
      let previousStep = 0;
      const context = gsap.context(() => {
        gsap.set(record, { x: 260, scale: .72, autoAlpha: 0 });
        gsap.set(waveform, { scaleX: .12, autoAlpha: .08, transformOrigin: 'center' });
        gsap.set(particles, { autoAlpha: 0, scale: .35, transformOrigin: 'center' });
        gsap.set(copies, { autoAlpha: 0, y: 30 });
        gsap.set(copies[0], { autoAlpha: 1, y: 0 });

        const timeline = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: story,
            start: 'top top',
            end: '+=280%',
            pin: stage,
            scrub: .55,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const next = self.progress < .34 ? 0 : self.progress < .72 ? 1 : 2;
              if (next !== previousStep) { previousStep = next; setActiveStep(next); }
            },
          },
        });
        timeline
          .to(machine, { rotateX: -1.4, y: -8, duration: .18 }, 0)
          .to(grid, { y: -32, duration: .33 }, 0)
          .to(waveform, { scaleX: .58, autoAlpha: 1, duration: .32 }, .13)
          .to(particles, { autoAlpha: .8, scale: 1, stagger: .015, duration: .25 }, .22)
          .to([copies[0]], { autoAlpha: 0, y: -24, duration: .12 }, .31)
          .to([copies[1]], { autoAlpha: 1, y: 0, duration: .15 }, .37)
          .to(camera, { x: -185, scale: .82, duration: .48 }, .36)
          .to(waveform, { scaleX: 1, x: 18, duration: .45 }, .4)
          .to(record, { x: 170, scale: .88, autoAlpha: 1, duration: .36 }, .48)
          .to(machine, { rotateX: 1.2, y: 8, duration: .25 }, .55)
          .to([copies[1]], { autoAlpha: 0, y: -24, duration: .12 }, .69)
          .to([copies[2]], { autoAlpha: 1, y: 0, duration: .15 }, .75)
          .to(camera, { x: -230, scale: .73, duration: .25 }, .76)
          .to(record, { x: 215, scale: 1, duration: .25 }, .76)
          .to(machine, { rotateX: 0, y: 0, duration: .2 }, .82);
      }, story);
      return () => context.revert();
    });
    return () => media.revert();
  }, []);

  return <section className="v12-signal-story" ref={storyRef} aria-label="How the Ventricura signal moves through a consultation">
    <div className="v12-signal-sticky">
      <div className="v12-signal-heading"><span>SIGNAL PATH</span><span>{`${signalSteps[activeStep][0]} / 03`}</span></div>
      <div className="v12-signal-machine">
        <div className="v12-machine-grid" aria-hidden="true" /><div className="v12-machine-topline"><span>VENTRICURA / SIGNAL SESSION</span><b>LIVE</b></div>
        <div className="v12-camera-card"><span>CAMERA / LIVE</span><div className="v12-camera-preview"><i className="v12-frame top-left" /><i className="v12-frame top-right" /><i className="v12-frame bottom-left" /><i className="v12-frame bottom-right" /><div className="v12-person"><i /><b /></div><em /></div><small><b /> FACE TRACKED</small></div>
        <div className="v12-signal-particles" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
        <svg className="v12-waveform" viewBox="0 0 620 190" aria-hidden="true"><path d="M0 102h58l30-25 35 53 58-103 58 143 58-70 57 5 35-27 35 58 51-98 54 104 42-40h68" /></svg>
        <div className="v12-record-card"><span>SESSION RECORD</span><div className="v12-record-patient"><i>RS</i><b>Ramsay S.</b><small>Signal ready</small></div><strong>74 <em>BPM</em></strong><svg viewBox="0 0 126 34" aria-hidden="true"><path d="M0 20h19l8-8 9 16 14-25 14 29 14-15 13 2 8-6 9 12 10-17 8 13h10" /></svg><i /><i /><small>REVIEW READY</small></div>
        <div className="v12-machine-footer"><span>INPUT</span><span>OPTICAL SIGNAL</span><span>CLINICIAN VIEW</span></div>
      </div>
      <div className="v12-signal-copy">{signalSteps.map(([number, title, text]) => <article key={number}><span>{number} / 03</span><h2>{title}</h2><p>{text}</p></article>)}</div>
      <div className="v12-signal-progress" aria-hidden="true"><i className={activeStep >= 0 ? 'active' : ''} /><i className={activeStep >= 1 ? 'active' : ''} /><i className={activeStep >= 2 ? 'active' : ''} /></div>
    </div>
  </section>;
}

export function TechnologyPage() {
  return <main className="ventricura-public technology-page"><Seo title="Contactless rPPG technology | Ventricura" description="How Ventricura connects guided camera checks, rPPG signals, and clinician review in a telehealth workflow." path="/technology" />
    <PublicHeader />
    <section className="v12-technology-hero">
      <div><p className="mono-kicker">VENTRICURA SIGNAL SYSTEM</p><h1>A clearer view,<br /><em>without another device.</em></h1><p>Ventricura connects a guided camera check, secure telehealth consultation, and clinician-facing signal context in one workflow.</p><div className="public-actions"><Link to="/demo" className="dark-action">Open live demo <ArrowRight size={17} /></Link><Link to="/clinician/sign-in" className="quiet-action">Clinician sign in</Link></div></div>
      <aside className="v12-hero-visual" aria-label="Illustration of an optical signal"><div className="v12-hero-orbit" /><div className="v12-hero-orbit orbit-two" /><div className="v12-hero-capture"><span>CAPTURE</span><i /><b>OPTICAL<br />INPUT</b></div><svg viewBox="0 0 380 90" aria-hidden="true"><path d="M0 46h47l20-15 20 31 36-56 41 76 42-35 40 3 30-18 25 35 34-54 29 43 37-30h51" /></svg><small>CAMERA → SIGNAL → CLINICIAN</small></aside>
    </section>
    <SignalStory />
    <section className="v12-technology-close"><div><p className="mono-kicker">THE WORKFLOW</p><h2>One appointment.<br />One protected <em>surface.</em></h2><p>The capture is part of a clinician-controlled appointment—not a separate patient account or a standalone data dashboard.</p></div><div className="v12-close-notes"><span>SHORT-LIVED ACCESS</span><span>LIVE CONSULTATION</span><span>RECORD CONTINUITY</span></div></section>
    <section className="public-trust-strip"><ShieldCheck /><div><strong>Purpose-built for a secure appointment flow</strong><span>Short-lived signal sessions, clinician-controlled access, and patient links designed for a single consultation.</span></div><LockKeyhole /></section>
    <PublicFooter />
  </main>;
}
