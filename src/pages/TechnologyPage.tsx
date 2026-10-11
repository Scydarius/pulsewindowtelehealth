import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicFooter, PublicHeader, Seo } from '../components/PublicSite';

const signalSteps = [
  ['01', 'Camera input', 'A patient joins a secure appointment link and follows a simple on-screen guide.'],
  ['02', 'Signal forming', 'Subtle changes in reflected light are organised into a live optical waveform.'],
  ['03', 'Clinical context', 'The clinician sees the signal in the same workspace as the consultation and record.'],
] as const;

function SignalStory() {
  const [activeStep, setActiveStep] = useState(0);
  const storyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    let frame = 0;
    const update = () => {
      const bounds = story.getBoundingClientRect();
      const stageElement = story.querySelector<HTMLElement>('.v12-signal-sticky');
      if (stageElement) {
        const stageHeight = stageElement.getBoundingClientRect().height;
        const stageWidth = stageElement.getBoundingClientRect().width;
        const shouldPin = bounds.top <= 0 && bounds.bottom >= stageHeight;
        stageElement.dataset.scrollPinned = shouldPin ? 'true' : 'false';
        if (shouldPin) {
          stageElement.style.setProperty('--signal-pinned-left', `${bounds.left}px`);
          stageElement.style.setProperty('--signal-pinned-width', `${stageWidth}px`);
        }
      }
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
      <div className="v12-signal-heading"><span>02 / SIGNAL PATH</span><span>{`${signalSteps[activeStep][0]} / 03`}</span></div>
      <div className="v12-signal-machine">
        <div className="v12-machine-grid" aria-hidden="true" />
        <div className="v12-machine-topline"><span>VENTRICURA / SIGNAL SESSION</span><b>LIVE</b></div>
        <div className="v12-camera-card"><span>CAMERA</span><div className="v12-face"><i /><i /><b /></div><small>FACE TRACKED</small></div>
        <div className="v12-signal-particles" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--particle': index } as React.CSSProperties} />)}</div>
        <svg className="v12-waveform" viewBox="0 0 620 190" aria-hidden="true"><path d="M0 102h58l30-25 35 53 58-103 58 143 58-70 57 5 35-27 35 58 51-98 54 104 42-40h68" /></svg>
        <div className="v12-record-card"><span>SESSION RECORD</span><strong>74 <em>BPM</em></strong><i /><i /><i /><small>REVIEW READY</small></div>
        <div className="v12-machine-footer"><span>INPUT</span><span>OPTICAL SIGNAL</span><span>CLINICIAN VIEW</span></div>
      </div>
      <div className="v12-signal-copy"><h2>{signalSteps[activeStep][1]}</h2><p>{signalSteps[activeStep][2]}</p></div>
    </div>
    <div className="v12-signal-steps">{signalSteps.map(([number, title, text], index) => <article key={number} className={activeStep === index ? 'active' : ''}><span>{number}</span><h3>{title}</h3><p>{text}</p><b>{activeStep === index ? 'In view' : 'Keep scrolling'}</b></article>)}</div>
  </section>;
}

export function TechnologyPage() {
  return <main className="ventricura-public technology-page"><Seo title="Contactless rPPG technology | Ventricura" description="How Ventricura connects guided camera checks, rPPG signals, and clinician review in a telehealth workflow." path="/technology" />
    <PublicHeader />
    <section className="v12-technology-hero">
      <div><p className="mono-kicker">VENTRICURA SIGNAL SYSTEM / 01</p><h1>A clearer view,<br /><em>without another device.</em></h1><p>Ventricura connects a guided camera check, secure telehealth consultation, and clinician-facing signal context in one workflow.</p><div className="public-actions"><Link to="/demo" className="dark-action">Open live demo <ArrowRight size={17} /></Link><Link to="/clinician/sign-in" className="quiet-action">Clinician sign in</Link></div></div>
      <aside className="v12-hero-visual" aria-label="Illustration of an optical signal"><div className="v12-hero-orbit" /><div className="v12-hero-orbit orbit-two" /><div className="v12-hero-capture"><span>CAPTURE</span><i /><b>OPTICAL<br />INPUT</b></div><svg viewBox="0 0 380 90" aria-hidden="true"><path d="M0 46h47l20-15 20 31 36-56 41 76 42-35 40 3 30-18 25 35 34-54 29 43 37-30h51" /></svg><small>CAMERA → SIGNAL → CLINICIAN</small></aside>
    </section>
    <SignalStory />
    <section className="v12-technology-close"><div><p className="mono-kicker">THE WORKFLOW</p><h2>One appointment.<br />One protected <em>surface.</em></h2><p>The capture is part of a clinician-controlled appointment—not a separate patient account or a standalone data dashboard.</p></div><div className="v12-close-notes"><span>SHORT-LIVED ACCESS</span><span>LIVE CONSULTATION</span><span>RECORD CONTINUITY</span></div></section>
    <section className="public-trust-strip"><ShieldCheck /><div><strong>Purpose-built for a secure appointment flow</strong><span>Short-lived signal sessions, clinician-controlled access, and patient links designed for a single consultation.</span></div><LockKeyhole /></section>
    <PublicFooter />
  </main>;
}
