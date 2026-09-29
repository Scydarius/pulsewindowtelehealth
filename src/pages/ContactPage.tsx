import { ArrowRight, CheckCircle2, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { PublicHeader } from './TechnologyPage';
import { PublicFooter, Seo } from '../components/PublicSite';

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string }>();
  const [sending, setSending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSending(true); setStatus(undefined);
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, organisation, message, website }) });
      const body = await response.json().catch(() => ({ error: 'We could not send your message. Please try again shortly.' })) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'We could not send your message. Please try again shortly.');
      setStatus({ tone: 'success', text: body.message ?? 'Thanks — your enquiry has been sent.' }); setName(''); setEmail(''); setOrganisation(''); setMessage('');
    } catch (reason) { setStatus({ tone: 'error', text: reason instanceof Error ? reason.message : 'We could not send your message. Please try again shortly.' }); }
    finally { setSending(false); }
  };
  return <main className="ventricura-public contact-page"><Seo title="Contact Ventricura | Book a pilot conversation" description="Talk to Ventricura about contactless rPPG research technology, remote care, pilots, and partnerships." path="/contact" />
    <PublicHeader />
    <section className="contact-hero"><div><p className="mono-kicker">CONTACT VENTRICURA</p><h1>Let’s talk about<br /><em>better remote care.</em></h1><p>Interested in a pilot, partnership, or learning more about our telehealth technology? Send us a note and we’ll get back to you.</p><div className="contact-points"><span><Mail size={17} /> Direct, human follow-up</span><span><ShieldCheck size={17} /> Please don’t send patient or health information</span></div></div><form className="contact-form" onSubmit={(event) => void submit(event)}><div className="contact-form-heading"><strong>Book a conversation</strong><span>Tell us what you are exploring and we’ll respond as soon as we can.</span></div><label>Your name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label><label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Organisation <small>(optional)</small><input value={organisation} onChange={(event) => setOrganisation(event.target.value)} autoComplete="organization" /></label><label>How can we help?<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="For example: pilot, partnership, clinician workflow, or research discussion." maxLength={4000} required /></label><label className="contact-honeypot" aria-hidden="true">Website<input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></label><button className="dark-action contact-submit" disabled={sending}>{sending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}{sending ? 'Sending enquiry…' : 'Send enquiry'}</button>{status && <p className={`contact-status ${status.tone}`}>{status.tone === 'success' && <CheckCircle2 size={17} />}{status.text}</p>}<p className="contact-privacy">Do not send patient records, health information, or urgent medical requests through this form.</p></form></section><PublicFooter />
  </main>;
}
