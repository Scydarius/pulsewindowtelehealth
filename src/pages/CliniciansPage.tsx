import { ArrowRight, CalendarPlus, ChartNoAxesCombined, ChevronDown, FileDown, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicFooter, PublicHeader, Seo } from '../components/PublicSite';

const steps = [
  { icon: CalendarPlus, title: 'Create an appointment', text: 'Create a patient record, select an appointment time, and issue a purpose-specific patient link.' },
  { icon: Video, title: 'Consult securely', text: 'Meet by video. The patient sees a guided camera check only when you ask them to start it.' },
  { icon: ChartNoAxesCombined, title: 'Review signal context', text: 'Review live API telemetry, waveforms, saved samples, and the patient’s appointment history.' },
  { icon: FileDown, title: 'Continue the record', text: 'Export saved samples and retain clinician-only consultation notes in the workspace.' },
];

const faqs = [
  {
    q: 'What camera or hardware is required for the patient and doctor?',
    a: 'Any standard consumer web optical camera (720p or 1080p at 30 fps) integrated into modern laptops, tablets, or smartphones. Patients do not need a pulse oximeter, blood pressure cuff, wearable sensor, or any external peripheral hardware.',
  },
  {
    q: 'Is patient video recorded, saved, or uploaded to servers?',
    a: 'Never. Video frames are processed strictly in transient browser memory to extract subtle facial micro-blushes (reflectance photoplethysmography) and discarded immediately. Raw video feeds are never recorded, archived, or transmitted to persistent storage.',
  },
  {
    q: 'How does Ventricura integrate with existing practice software (Best Practice, MedicalDirector, Epic)?',
    a: 'Ventricura operates standalone or alongside your current EHR. Clinicians can generate 1-click structured SOAP notes, copy formatted vitals directly into the clipboard with one click, or export signed A4 PDF clinical encounter reports directly into patient files.',
  },
  {
    q: 'How does the 30-second quality-weighted clinical averaging work?',
    a: 'Rather than outputting instantaneous raw frequency peaks that might jump during patient motion or noise, Ventricura stabilizes readings across a continuous 30-second rolling window weighted by signal quality and signal-to-noise ratio (SNR), providing dependable clinical-grade values.',
  },
  {
    q: 'How does our clinic onboard for a clinical evaluation trial?',
    a: 'Selected GP practices and telehealth clinics receive pre-configured clinician accounts, custom booking calendars, staff training walkthroughs, and direct engineering support throughout their trial. Contact our team to initiate a clinic pilot.',
  },
];

function ClinicianFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index));
  };

  return (
    <section className="clinician-faq-section">
      <div className="section-caption">
        <p className="mono-kicker">FREQUENTLY ASKED QUESTIONS</p>
        <h2>Clinical trial & pilot FAQ.</h2>
        <p>Key information regarding hardware prerequisites, data privacy, and clinical integration.</p>
      </div>
      <div className="faq-accordion" role="region" aria-label="Frequently Asked Questions">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={faq.q} className={`faq-item ${isOpen ? 'open' : ''}`}>
              <button
                type="button"
                className="faq-question"
                onClick={() => toggle(index)}
                aria-expanded={isOpen}
              >
                <span>{faq.q}</span>
                <ChevronDown className={`faq-chevron ${isOpen ? 'rotated' : ''}`} size={18} />
              </button>
              {isOpen && (
                <div className="faq-answer">
                  <p>{faq.a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ClinicianFlow() {
  const [activeStep, setActiveStep] = useState(0);
  const flowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;
    let frame = 0;
    const updateFlow = () => {
      const bounds = flow.getBoundingClientRect();
      const travel = Math.max(1, flow.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -bounds.top / travel));
      flow.style.setProperty('--flow-progress', progress.toFixed(4));
      flow.style.setProperty('--flow-tilt', `${((.5 - progress) * 2).toFixed(3)}deg`);
      flow.style.setProperty('--flow-lift', `${((.5 - progress) * 18).toFixed(2)}px`);
      flow.style.setProperty('--flow-grid-y', `${(progress * -34).toFixed(2)}px`);
      flow.style.setProperty('--flow-step-shift', `${((progress - .5) * -12).toFixed(2)}px`);
      const stage = Math.min(steps.length - 1, Math.floor(progress * steps.length));
      setActiveStep((current) => current === stage ? current : stage);
      frame = 0;
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateFlow);
    };
    updateFlow();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const ActiveIcon = steps[activeStep].icon;
  return <section className="v11-clinician-flow" ref={flowRef} aria-label="The Ventricura clinical workflow">
    <div className="v11-flow-sticky">
      <div className="v11-flow-heading"><span>02 / CLINICAL FLOW</span><span>{`0${activeStep + 1} / 0${steps.length}`}</span></div>
      <div className="v11-flow-stage" data-active-stage={activeStep}>
        <div className="v11-flow-grid" aria-hidden="true" />
        <div className="v11-flow-topline"><span>VENTRICURA / CLINIC WORKSPACE</span><b>ACTIVE</b></div>
        <div className="v11-flow-center">
          <div className="v11-flow-icon"><ActiveIcon size={34} strokeWidth={1.5} /></div>
          <span>{`STAGE 0${activeStep + 1}`}</span>
          <strong>{steps[activeStep].title}</strong>
          <p>{steps[activeStep].text}</p>
        </div>
        <div className="v11-flow-rail" aria-hidden="true">{steps.map((step, index) => <span key={step.title} className={index <= activeStep ? 'complete' : ''}><i />{`0${index + 1}`}</span>)}</div>
      </div>
      <p className="v11-flow-caption">A patient has one simple path in. The clinician retains context at every point.</p>
    </div>
    <div className="v11-flow-steps">{steps.map(({ title, text }, index) => <article key={title} className={index === activeStep ? 'active' : ''}><span>{`0${index + 1}`}</span><h3>{title}</h3><p>{text}</p><b>{index === activeStep ? 'On screen' : 'Continue'}</b></article>)}</div>
  </section>;
}

export function CliniciansPage() {
  return <main className="ventricura-public clinicians-page"><Seo title="For clinicians | Ventricura" description="A clinician-controlled telehealth workflow with contactless rPPG signals and patient history." path="/clinicians" /><PublicHeader />
    <section className="v6-clinician-hero">
      <div className="v6-clinician-copy"><p className="mono-kicker">CLINIC WORKSPACE / 02</p><h1>Keep the<br /><em>care moving.</em></h1><p>Appointments, video, patient history and private follow-up live in the same protected clinical workspace—without turning the patient experience into another app.</p><div className="public-actions"><Link to="/contact" className="dark-action">Book a pilot conversation <ArrowRight size={17} /></Link><Link to="/clinician/sign-in" className="quiet-action">Clinician sign in</Link></div></div>
      <aside className="v6-clinician-field" aria-label="Illustration of the clinician workspace"><header><span>VENTRICURA / CLINIC SYSTEM</span><b>NODE / READY</b></header><div className="v6-field-center"><i /><div><small>SESSION CONTEXT</small><strong>One record.<br />Every next step.</strong></div></div><div className="v6-field-columns"><span>INVITE<br /><b>Patient access</b></span><span>CONSULT<br /><b>Video & capture</b></span><span>CONTINUE<br /><b>Notes & review</b></span></div><footer><span>CLINICIAN CONTROLLED</span><span>PROTECTED ACCESS</span></footer></aside>
    </section>
    <ClinicianFlow />
    <ClinicianFaq />
    <section className="clinician-pilot-cta">
      <div>
        <p className="mono-kicker">PILOT OPPORTUNITIES</p>
        <h2>Trial contactless vitals in your clinic.</h2>
        <p>We are currently onboarding selected general practices, cardiology clinics, and remote telehealth providers for structured clinical pilots.</p>
      </div>
      <Link to="/contact" className="dark-action">
        Book a 20-minute clinical walkthrough <ArrowRight size={17} />
      </Link>
    </section>
    <PublicFooter />
  </main>;
}
