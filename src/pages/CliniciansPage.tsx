import { ArrowRight, CalendarPlus, ChartNoAxesCombined, FileDown, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PublicFooter, Seo } from '../components/PublicSite';
import { PublicHeader } from './TechnologyPage';

const steps = [
  { icon: CalendarPlus, title: 'Create an appointment', text: 'Create a patient record, select an appointment time, and issue a purpose-specific patient link.' },
  { icon: Video, title: 'Consult securely', text: 'Meet by video. The patient sees a guided camera check only when you ask them to start it.' },
  { icon: ChartNoAxesCombined, title: 'Review signal context', text: 'Review live API telemetry, waveforms, saved samples, and the patient’s appointment history.' },
  { icon: FileDown, title: 'Continue the record', text: 'Export saved samples and retain clinician-only consultation notes in the workspace.' },
];

export function CliniciansPage() {
  return <main className="ventricura-public clinicians-page"><Seo title="For clinicians | Ventricura" description="A clinician-controlled telehealth workflow with contactless rPPG signals and patient history." path="/clinicians" /><PublicHeader />
    <section className="clinicians-hero"><div><p className="mono-kicker">FOR CLINICIANS</p><h1>Remote appointments,<br /><em>properly connected.</em></h1><p>Ventricura brings secure appointment links, video consultation, camera-based rPPG signals, patient records, and private notes into one clinician-controlled workflow.</p><div className="public-actions"><Link to="/contact" className="dark-action">Book a pilot conversation <ArrowRight size={17} /></Link><Link to="/clinician/sign-in" className="quiet-action">Clinician sign in</Link></div></div></section>
    <section className="clinician-flow"><div className="section-caption"><p className="mono-kicker">ONE WORKFLOW</p><h2>From invitation to follow-up.</h2><p>A simple flow for clinicians and a focused, guided experience for patients.</p></div><div className="v-workflow-grid">{steps.map(({ icon: Icon, title, text }, index) => <article key={title}><span>{`0${index + 1}`}</span><Icon /><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <PublicFooter />
  </main>;
}
