import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { supabase } from '../services/supabase';

export function PublicHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isCliniciansRoute = location.pathname === '/clinicians';
  const [clinicianSignedIn, setClinicianSignedIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: { session } }) => setClinicianSignedIn(Boolean(session)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setClinicianSignedIn(Boolean(session)));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="public-header">
      <Link
        to={isCliniciansRoute && clinicianSignedIn ? '/clinician' : '/'}
        className={`public-brand ${isCliniciansRoute ? 'public-brand-clinician' : ''}`}
        aria-label={isCliniciansRoute ? 'Ventricura for clinicians' : 'Ventricura home'}
      >
        <img src="/ventricura-logo-centred.png" alt="Ventricura" />
        {isCliniciansRoute && <span className="brand-subtext">FOR CLINICIANS</span>}
      </Link>
      <nav className="desktop-public-nav" aria-label="Public navigation">
        <Link to="/technology">Technology</Link>
        <Link to="/clinicians">For clinicians</Link>
        <Link to="/demo">Live demo</Link>
        <Link to="/contact">Contact</Link>
        <Link to={clinicianSignedIn ? '/clinician' : '/clinician/sign-in'} className="header-access">
          {clinicianSignedIn ? 'Clinician workspace' : 'Clinician access'} <ArrowRight size={15} />
        </Link>
      </nav>
      <button
        type="button"
        className="public-mobile-toggle"
        onClick={() => setMobileMenuOpen((open) => !open)}
        aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      {mobileMenuOpen && (
        <>
          <div className="public-mobile-backdrop" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
          <div className="public-mobile-drawer" role="dialog" aria-label="Mobile navigation">
            <nav>
              <Link to="/technology" onClick={() => setMobileMenuOpen(false)}>Technology</Link>
              <Link to="/clinicians" onClick={() => setMobileMenuOpen(false)}>For clinicians</Link>
              <Link to="/demo" onClick={() => setMobileMenuOpen(false)}>Live demo</Link>
              <Link to="/contact" onClick={() => setMobileMenuOpen(false)}>Contact</Link>
              <Link to="/clinician/sign-in" className="mobile-drawer-access" onClick={() => setMobileMenuOpen(false)}>Clinician access <ArrowRight size={15} /></Link>
            </nav>
          </div>
        </>
      )}
    </header>
  );
}

type SeoProps = { title: string; description: string; path: string; jsonLd?: Record<string, unknown> };

function setMeta(selector: string, attribute: 'name' | 'property', key: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
}

/** Public-page metadata is kept close to each route so crawlers and shares get useful context. */
export function Seo({ title, description, path, jsonLd }: SeoProps) {
  useEffect(() => {
    const url = `https://www.ventricura.com${path}`;
    document.title = title;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = url;
    const existing = document.head.querySelector<HTMLScriptElement>('script[data-ventricura-schema]');
    if (jsonLd) {
      const script = existing ?? document.createElement('script');
      script.type = 'application/ld+json'; script.dataset.ventricuraSchema = 'true'; script.text = JSON.stringify(jsonLd);
      if (!existing) document.head.appendChild(script);
    } else existing?.remove();
  }, [description, jsonLd, path, title]);
  return null;
}

export function PublicFooter() {
  return <footer className="public-footer public-footer-expanded">
    <div><img src="/ventricura-logo-centred.png" alt="Ventricura" /><span>Contactless telehealth technology.</span></div>
    <nav aria-label="Footer navigation"><Link to="/clinicians">For clinicians</Link><Link to="/technology">Technology</Link><Link to="/contact">Contact</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/security">Security</Link></nav>
  </footer>;
}

export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Ventricura',
  url: 'https://www.ventricura.com/',
  logo: 'https://www.ventricura.com/ventricura-logo-centred.png',
  email: 'admin@ventricura.com',
  description: 'Contactless rPPG technology for telehealth and remote care.',
  contactPoint: [{ '@type': 'ContactPoint', contactType: 'business enquiries', email: 'admin@ventricura.com', url: 'https://www.ventricura.com/contact' }],
};
