import { ArrowRight, CalendarPlus, ChartNoAxesCombined, ChevronDown, FileDown, Video } from 'lucide-react';
import { useState } from 'react';
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

export function CliniciansPage() {
  return <main className="ventricura-public clinicians-page"><Seo title="For clinicians | Ventricura" description="A clinician-controlled telehealth workflow with contactless rPPG signals and patient history." path="/clinicians" /><PublicHeader />
    <section className="clinicians-hero"><div><p className="mono-kicker">FOR CLINICIANS</p><h1>Remote appointments,<br /><em>properly connected.</em></h1><p>Ventricura brings secure appointment links, video consultation, camera-based rPPG signals, patient records, and private notes into one clinician-controlled workflow.</p><div className="public-actions"><Link to="/contact" className="dark-action">Book a pilot conversation <ArrowRight size={17} /></Link><Link to="/clinician/sign-in" className="quiet-action">Clinician sign in</Link></div></div></section>
    <section className="clinician-flow"><div className="section-caption"><p className="mono-kicker">ONE WORKFLOW</p><h2>From invitation to follow-up.</h2><p>A simple flow for clinicians and a focused, guided experience for patients.</p></div><div className="v-workflow-grid">{steps.map(({ icon: Icon, title, text }, index) => <article key={title}><span>{`0${index + 1}`}</span><Icon /><h3>{title}</h3><p>{text}</p></article>)}</div></section>
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
