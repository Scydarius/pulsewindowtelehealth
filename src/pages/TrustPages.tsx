import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PublicFooter, Seo } from '../components/PublicSite';
import { PublicHeader } from './TechnologyPage';

type TrustPageProps = { kind: 'privacy' | 'terms' | 'security' };
const copy = {
  privacy: { title: 'Privacy', intro: 'How Ventricura handles information supplied through this website and platform.', sections: [
    ['Information we collect', 'Website enquiries may include your name, work email address, organisation, and message. Please do not submit patient records, health information, or urgent requests through the public contact form.'],
    ['Information used in an appointment', 'The platform may hold clinician account details, patient names and email addresses, appointment times, booking notes, private clinician notes, consent records, and measurements saved during an appointment.'],
    ['How access works', 'Approved clinicians can access their own patient and appointment records. Platform administrators manage clinician access and may remove a patient record when authorised. A patient appointment link is specific to one appointment, expires automatically, and can be revoked by the clinician.'],
    ['Service providers and storage', 'Ventricura uses Supabase for authentication and clinical database records, Vercel for the web application, LiveKit for configured video rooms, Railway for signal processing, and Resend for appointment emails. Each provider receives only the information needed to provide its part of the service.'],
    ['Retention and deletion', 'Appointment records are retained under the applicable clinic agreement and operational requirements. An authorised Ventricura administrator can remove a patient record and its linked appointments, notes, measurements and patient links from the platform. Requests are assessed with the clinic before deletion where records may be required to be retained.'],
    ['How we use information', 'We use information to provide bookings and consultations, operate clinician access controls, send appointment emails, maintain security, troubleshoot issues, and improve the service.'],
    ['Questions or requests', 'For privacy questions, access requests, or correction and deletion requests, contact admin@ventricura.com.'],
  ] },
  terms: { title: 'Terms of use', intro: 'The basic rules for using the Ventricura website and platform.', sections: [
    ['Appropriate use', 'Use the public website lawfully and do not submit sensitive patient information through the contact form. Clinician workspace access is restricted to administrator-approved users.'],
    ['Accounts and links', 'Clinicians are responsible for keeping their account access secure. Patient appointment links are intended only for the person and appointment they were issued for.'],
    ['Changes and contact', 'The service and these terms may change as Ventricura develops. Questions can be sent to admin@ventricura.com.'],
  ] },
  security: { title: 'Security', intro: 'The controls currently used to support the Ventricura workflow.', sections: [
    ['Access control', 'Clinician access is restricted to administrator-approved accounts. Patient access uses a purpose-specific link for one appointment only; the link expires automatically and clinicians can revoke or replace it.'],
    ['Short-lived measurement access', 'The rPPG signal service is reached through short-lived signed access sessions rather than exposing the service secret in the browser.'],
    ['Operational safeguards', 'Ventricura records key appointment, patient-link and consent events to support accountable access. Private clinician notes are not available through patient appointment links.'],
    ['Report a concern', 'If you believe you have found a security issue, contact admin@ventricura.com with a clear description. Do not send sensitive patient information by email.'],
  ] },
} as const;

export function TrustPage({ kind }: TrustPageProps) {
  const page = copy[kind];
  return <main className="ventricura-public trust-page"><Seo title={`${page.title} | Ventricura`} description={page.intro} path={`/${kind}`} /><PublicHeader />
    <article className="trust-article"><p className="mono-kicker">VENTRICURA / {page.title.toUpperCase()}</p><h1>{page.title}</h1><p className="trust-intro">{page.intro}</p>{page.sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}<div className="trust-cta"><LockKeyhole /><div><strong>Have a question?</strong><span>We’re happy to explain the workflow or direct your enquiry.</span></div><Link to="/contact">Contact Ventricura <ArrowRight size={15} /></Link></div></article>
    <PublicFooter />
  </main>;
}
