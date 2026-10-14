import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock,
  ExternalLink,
  HeartPulse,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  User,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicFooter, PublicHeader, Seo } from '../components/PublicSite';
import '../styles/clinic-site.css';

export type ClinicDoctor = {
  id: string;
  name: string;
  title: string;
  about: string;
  photoUrl: string | null;
  bookingUrl: string | null;
  durationMinutes: number;
  bookingReason: string;
};

export type ClinicSite = {
  id: string;
  name: string;
  slug: string;
  headline: string;
  intro: string;
  about: string;
  address: string;
  specialties: string[];
  phone: string;
  email: string;
  bookingUrl: string | null;
  doctors: ClinicDoctor[];
};

export function ClinicWebsitePage({ slug }: { slug: string }) {
  const [clinic, setClinic] = useState<ClinicSite | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    void fetch(`/api/clinician-invitations?action=clinic-site&slug=${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const body = (await response.json()) as { clinic?: ClinicSite; error?: string };
        if (!response.ok || !body.clinic) {
          throw new Error(body.error ?? 'Clinic page not found.');
        }
        if (active) {
          setClinic(body.clinic);
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="clinic-site-state">
        <LoaderCircle className="spin" size={32} />
        <strong>Loading clinic website…</strong>
        <p>Connecting to {slug}.ventricura.com</p>
      </main>
    );
  }

  if (error || !clinic) {
    return (
      <main className="clinic-site-state error-state">
        <CircleAlert size={36} />
        <h1>Clinic page unavailable</h1>
        <p>
          We couldn&apos;t find an active clinic at <strong>ventricura.com/{slug}</strong>.
        </p>
        <div className="clinic-state-actions">
          <Link to="/" className="button button-primary">
            Visit Ventricura Home
          </Link>
          <Link to="/contact" className="button button-secondary">
            Contact Support
          </Link>
        </div>
      </main>
    );
  }

  const defaultSpecialties = [
    'General Telehealth',
    'Specialist Consultation',
    'Contactless Biometrics',
    'Longitudinal Remote Care',
  ];
  const displaySpecialties = clinic.specialties.length > 0 ? clinic.specialties : defaultSpecialties;

  return (
    <main className="ventricura-public clinic-site-page">
      <Seo
        title={`${clinic.name} | Ventricura Telehealth Clinic`}
        description={clinic.intro || `Book a telehealth consultation with ${clinic.name}.`}
        path={`/${clinic.slug}`}
      />
      <PublicHeader />

      {/* Hero Section */}
      <section className="clinic-hero-section">
        <div className="clinic-hero-container">
          <div className="clinic-badge">
            <HeartPulse size={15} />
            <span>{clinic.name.toUpperCase()} · ACCREDITED TELEHEALTH CLINIC</span>
          </div>

          <h1 className="clinic-hero-title">
            {clinic.headline || `Exceptional clinical care at ${clinic.name}.`}
          </h1>

          <p className="clinic-hero-intro">
            {clinic.intro ||
              'Consult with our accredited doctors and specialists from the comfort of home, backed by contactless biometric vitals monitoring.'}
          </p>

          <div className="clinic-hero-cta">
            {clinic.bookingUrl ? (
              <a className="button button-primary cta-btn" href={clinic.bookingUrl}>
                Book an appointment <CalendarDays size={17} />
              </a>
            ) : clinic.doctors.length > 0 ? (
              <a className="button button-primary cta-btn" href="#doctors">
                Meet our doctors <ArrowRight size={17} />
              </a>
            ) : (
              <a className="button button-primary cta-btn" href="#contact">
                Contact clinic <ArrowRight size={17} />
              </a>
            )}
            <a className="button button-secondary cta-btn" href="#contact">
              Practice details & location
            </a>
          </div>

          <div className="clinic-hero-highlights">
            <div>
              <CheckCircle2 size={16} />
              <span>No patient app installs needed</span>
            </div>
            <div>
              <ShieldCheck size={16} />
              <span>Encrypted medical-grade telehealth</span>
            </div>
            <div>
              <Activity size={16} />
              <span>Contactless vitals during consultation</span>
            </div>
          </div>
        </div>
      </section>

      {/* Specialties Strip */}
      <section className="clinic-specialties-strip">
        <div className="clinic-site-wrapper">
          <p className="specialties-label">CLINICAL SPECIALTIES & PRACTICE FOCUS</p>
          <div className="specialties-pills">
            {displaySpecialties.map((item) => (
              <span key={item} className="specialty-pill">
                <Stethoscope size={14} />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Doctors / Specialists Section */}
      <section id="doctors" className="clinic-doctors-section">
        <div className="clinic-site-wrapper">
          <div className="section-intro-block">
            <p className="mono-kicker">OUR CLINICAL TEAM</p>
            <h2>Doctors & Specialists</h2>
            <p>
              Schedule a high-definition video consultation with our accredited practitioners.
            </p>
          </div>

          {clinic.doctors.length === 0 ? (
            <div className="no-doctors-card">
              <Stethoscope size={28} />
              <h3>Practitioner roster updating</h3>
              <p>
                Our clinician booking calendar is currently being synchronized. Please reach out to{' '}
                <strong>{clinic.name}</strong> directly using the contact details below to schedule
                your next consultation.
              </p>
              <a href="#contact" className="button button-secondary">
                View Contact Information
              </a>
            </div>
          ) : (
            <div className="doctor-cards-grid">
              {clinic.doctors.map((doctor) => (
                <article key={doctor.id} className="doctor-card">
                  <div className="doctor-card-header">
                    <div className="doctor-avatar">
                      {doctor.photoUrl ? (
                        <img src={doctor.photoUrl} alt={doctor.name} />
                      ) : (
                        <div className="doctor-avatar-fallback">
                          <User size={26} />
                        </div>
                      )}
                    </div>
                    <div className="doctor-headline">
                      <h3>{doctor.name}</h3>
                      <span className="doctor-title">{doctor.title}</span>
                    </div>
                  </div>

                  <p className="doctor-bio">
                    {doctor.about ||
                      'Experienced medical practitioner offering secure telehealth appointments, vitals assessments, and continuous treatment follow-up.'}
                  </p>

                  <div className="doctor-meta">
                    <span>
                      <Clock size={14} />
                      {doctor.durationMinutes} min consultation
                    </span>
                    <span>
                      <Video size={14} />
                      HD Video & Contactless Vitals
                    </span>
                  </div>

                  <div className="doctor-action">
                    {doctor.bookingUrl ? (
                      <a
                        href={doctor.bookingUrl}
                        className="button button-primary doctor-book-button"
                      >
                        <CalendarDays size={16} /> Book consultation
                      </a>
                    ) : clinic.email ? (
                      <a
                        href={`mailto:${clinic.email}?subject=Consultation appointment request: ${encodeURIComponent(doctor.name)}`}
                        className="button button-secondary doctor-book-button"
                      >
                        <Mail size={16} /> Request booking
                      </a>
                    ) : (
                      <a href="#contact" className="button button-secondary doctor-book-button">
                        Contact practice
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Practice Details & Location Section */}
      <section id="contact" className="clinic-details-section">
        <div className="clinic-site-wrapper">
          <div className="clinic-details-grid">
            {/* About the clinic */}
            <article className="clinic-about-card">
              <p className="mono-kicker">ABOUT {clinic.name.toUpperCase()}</p>
              <h2>Care designed around the patient.</h2>
              <p className="clinic-about-text">
                {clinic.about ||
                  `${clinic.name} delivers private medical appointments, specialist care, and post-treatment monitoring powered by Ventricura's contactless clinical telehealth workspace.`}
              </p>

              <div className="telehealth-perks">
                <div className="telehealth-perk-item">
                  <div className="perk-icon">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <strong>Frictionless access</strong>
                    <p>Patients receive a one-click browser link via SMS or email. No downloads or apps needed.</p>
                  </div>
                </div>
                <div className="telehealth-perk-item">
                  <div className="perk-icon">
                    <Activity size={18} />
                  </div>
                  <div>
                    <strong>Continuous clinical monitoring</strong>
                    <p>Camera-assisted contactless vital metrics provide rich objective context during consultation.</p>
                  </div>
                </div>
                <div className="telehealth-perk-item">
                  <div className="perk-icon">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <strong>End-to-end encrypted</strong>
                    <p>Session streams and patient notes comply with Australian medical privacy standards.</p>
                  </div>
                </div>
              </div>
            </article>

            {/* Contact & Location Info */}
            <aside className="clinic-info-card">
              <p className="mono-kicker">PRACTICE INFORMATION & LOCATION</p>
              <h2>Contact the clinic</h2>

              <div className="clinic-info-list">
                {clinic.address ? (
                  <div className="clinic-info-item">
                    <MapPin className="info-icon" size={20} />
                    <div className="info-body">
                      <strong>Practice Address</strong>
                      <p>{clinic.address}</p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${clinic.name} ${clinic.address}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="maps-link"
                      >
                        Open in Google Maps <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="clinic-info-item">
                    <MapPin className="info-icon" size={20} />
                    <div className="info-body">
                      <strong>Service Area</strong>
                      <p>Accredited Telehealth Consultation across Australia</p>
                    </div>
                  </div>
                )}

                {clinic.phone && (
                  <a
                    className="clinic-info-item link-item"
                    href={`tel:${clinic.phone.replace(/\s/g, '')}`}
                  >
                    <Phone className="info-icon" size={20} />
                    <div className="info-body">
                      <strong>Telephone</strong>
                      <p>{clinic.phone}</p>
                    </div>
                  </a>
                )}

                {clinic.email && (
                  <a className="clinic-info-item link-item" href={`mailto:${clinic.email}`}>
                    <Mail className="info-icon" size={20} />
                    <div className="info-body">
                      <strong>Email enquiries</strong>
                      <p>{clinic.email}</p>
                    </div>
                  </a>
                )}

                <div className="clinic-info-item">
                  <Clock className="info-icon" size={20} />
                  <div className="info-body">
                    <strong>Telehealth Consultation Hours</strong>
                    <p>Monday – Friday: 8:30 AM – 5:30 PM</p>
                    <small>Evening consultations available by appointment</small>
                  </div>
                </div>
              </div>

              <div className="clinic-staff-cta">
                <small>Are you a doctor or staff member at {clinic.name}?</small>
                <Link to="/clinician/sign-in" className="staff-portal-link">
                  Clinician workspace sign-in <ArrowRight size={14} />
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
