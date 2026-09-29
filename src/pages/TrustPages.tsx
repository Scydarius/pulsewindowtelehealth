import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PublicFooter, Seo } from '../components/PublicSite';
import { PublicHeader } from './TechnologyPage';

type TrustPageProps = { kind: 'privacy' | 'terms' | 'security' };
const copy = {
  privacy: { title: 'Privacy', intro: 'How Ventricura handles information supplied through this website and platform.', sections: [
    ['Information we collect', 'Website enquiries may include your name, work email address, organisation, and message. Please do not submit patient records, health information, or urgent requests through the public contact form.'],
    ['Platform information', 'Clinician accounts, appointment details, consultation notes, and saved research telemetry are used to operate the clinician workflow. Access is limited to the people and systems needed for that workflow.'],
    ['How we use information', 'We use information to respond to enquiries, provide the platform, maintain security, troubleshoot issues, and improve the service.'],
    ['Questions or requests', 'For privacy questions or requests about information associated with Ventricura, contact admin@ventricura.com.'],
  ] },
  terms: { title: 'Terms of use', intro: 'The basic rules for using the Ventricura website and research platform.', sections: [
    ['Research technology only', 'Ventricura presents camera-based rPPG research telemetry. It is not a diagnostic device, emergency service, or replacement for clinical judgement or validated medical equipment.'],
    ['Appropriate use', 'Use the public website lawfully and do not submit sensitive patient information through the contact form. Clinician workspace access is restricted to administrator-approved users.'],
    ['Accounts and links', 'Clinicians are responsible for keeping their account access secure. Patient appointment links are intended only for the person and appointment they were issued for.'],
    ['Changes and contact', 'The service and these terms may change as Ventricura develops. Questions can be sent to admin@ventricura.com.'],
  ] },
  security: { title: 'Security', intro: 'The controls currently used to support the Ventricura workflow.', sections: [
    ['Access control', 'Clinician access is restricted to administrator-approved accounts. Patient access uses purpose-specific appointment links.'],
    ['Short-lived measurement access', 'The rPPG signal service is reached through short-lived signed access sessions rather than exposing the service secret in the browser.'],
    ['Operational safeguards', 'Ventricura uses the platform’s access controls and records to support secure appointments, private clinician notes, and controlled patient links.'],
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
