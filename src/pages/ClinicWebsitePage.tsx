import { ArrowRight, CalendarDays, CircleAlert, LoaderCircle, MapPin, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicFooter, PublicHeader, Seo } from '../components/PublicSite';

type ClinicSite = { name: string; slug: string; headline: string; intro: string; about: string; phone: string; email: string; bookingUrl: string | null };

export function ClinicWebsitePage({ slug }: { slug: string }) {
  const [clinic, setClinic] = useState<ClinicSite>(); const [error, setError] = useState('');
  useEffect(() => { void fetch(`/api/clinician-invitations?action=clinic-site&slug=${encodeURIComponent(slug)}`).then(async (response) => { const body = await response.json() as { clinic?: ClinicSite; error?: string }; if (!response.ok || !body.clinic) throw new Error(body.error ?? 'Clinic page not found.'); setClinic(body.clinic); }).catch((reason: Error) => setError(reason.message)); }, [slug]);
  if (error) return <main className="clinic-site-state"><CircleAlert size={28} /><h1>Clinic page unavailable</h1><p>{error}</p><Link to="/">Visit Ventricura</Link></main>;
  if (!clinic) return <main className="clinic-site-state"><LoaderCircle className="spin" /><strong>Loading clinic website…</strong></main>;
  return <main className="ventricura-public clinic-site"><Seo title={`${clinic.name} | Ventricura`} description={clinic.intro} path="/" /><PublicHeader /><section className="clinic-site-hero"><p className="mono-kicker">{clinic.name.toUpperCase()} · POWERED BY VENTRICURA</p><h1>{clinic.headline || `Welcome to ${clinic.name}`}</h1><p>{clinic.intro || 'Book a secure telehealth consultation with our clinical team.'}</p><div className="public-actions">{clinic.bookingUrl ? <a className="dark-action" href={clinic.bookingUrl}>Book an appointment <CalendarDays size={17} /></a> : <Link className="dark-action" to="/contact">Contact the clinic <ArrowRight size={17} /></Link>}<Link className="quiet-action" to="/clinician/sign-in">Clinician access</Link></div></section><section className="clinic-site-details"><article><p className="mono-kicker">ABOUT THE CLINIC</p><h2>Care that fits around your life.</h2><p>{clinic.about || `${clinic.name} uses Ventricura for private online appointments and secure clinician follow-up.`}</p></article><aside><p className="mono-kicker">CONTACT</p>{clinic.phone && <a href={`tel:${clinic.phone.replace(/\s/g, '')}`}><Phone size={17} /> {clinic.phone}</a>}{clinic.email && <a href={`mailto:${clinic.email}`}><MapPin size={17} /> {clinic.email}</a>}{!clinic.phone && !clinic.email && <p>Contact the clinic directly for appointment support.</p>}</aside></section><PublicFooter /></main>;
}
