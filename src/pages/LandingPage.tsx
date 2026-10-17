import { Activity, ArrowRight, Camera, Check, Copy, FileText, Lock, Smartphone, Sparkles } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { organizationSchema, PublicFooter, PublicHeader, Seo } from '../components/PublicSite';
import { ClinicWebsitePage } from './ClinicWebsitePage';
import '../styles/home-v4.css';

gsap.registerPlugin(ScrollTrigger);

function clinicSlugFromHost() {
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith('.ventricura.com')) return null;
  const slug = host.slice(0, -'.ventricura.com'.length);
  return slug && !['www', 'app'].includes(slug) ? slug : null;
}

const workflow = [
  {
    step: '01',
    tab: 'Patient Invite',
    tag: '01 / ZERO-FRICTION ACCESS',
    title: 'Zero app downloads. Zero patient accounts.',
    description: 'Send a direct booking link or SMS invite. Patients tap once and join immediately in Safari, Chrome, or Edge on any smartphone or laptop. No App Store downloads, no forgotten passwords, and no friction for vulnerable patients.',
    pills: [
      'Instant SMS or email invite link',
      'Runs natively in Safari, Chrome & Edge',
      'Zero account creation or password barrier',
    ],
  },
  {
    step: '02',
    tab: 'Video & Vitals',
    tag: '02 / LIVE CLINICAL WORKSPACE',
    title: 'Video and vital signs on one single screen.',
    description: 'While speaking with your patient, Ventricura uses standard camera optical photoplethysmography (rPPG) to extract real-time pulse rate, respiration, and signal quality. No wearable sensors or external hardware required.',
    pills: [
      'Contactless optical rPPG via standard webcam',
      '30-second rolling quality-weighted average',
      'In-consultation clinical note taker',
    ],
  },
  {
    step: '03',
    tab: 'EHR Hand-off',
    tag: '03 / AUDIT & EHR EXPORT',
    title: 'Charted and exported before the next patient.',
    description: 'Never manually re-type vitals. Copy a clean, formatted encounter note straight into your practice management software (Best Practice, MedicalDirector, Epic) with one click, or export a signed A4 clinical summary with waveform audit data.',
    pills: [
      '1-click formatted clipboard SOAP note',
      'Best Practice, MedicalDirector & Epic ready',
      'Signed A4 clinical encounter PDF export',
    ],
  },
];

export function LandingPage() {
  const clinicSlug = clinicSlugFromHost();
  const [clinicianSignedIn, setClinicianSignedIn] = useState(false);
  const [activeStory, setActiveStory] = useState(0);
  const [soapCopied, setSoapCopied] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<string | null>(() => {
    try {
      const cached = localStorage.getItem('ventricura_banner_active') || localStorage.getItem('ventricura_banner_ventricura');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.text && parsed.enabled !== false) return parsed.text;
      }
    } catch {}
    return null;
  });
  const storyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void fetch('/api/clinician-invitations?action=clinic-site&slug=ventricura')
      .then((res) => res.json())
      .then((data: { clinic?: { bannerText?: string | null; bannerEnabled?: boolean } }) => {
        if (data?.clinic?.bannerText && data.clinic.bannerEnabled !== false) {
          setActiveAnnouncement(data.clinic.bannerText);
        }
      })
      .catch(() => {});
  }, []);

  const handleCopySoap = () => {
    const soapSnippet = `VENTRICURA ENCOUNTER — #VN-8429
Date: 15 Oct 2026 | Duration: 14m 20s
Patient: Sarah Jenkins (DOB: 14/08/1984)
Clinician: Dr. Ramsay Stratford (Metro Health)
Vitals (30s rPPG): HR 72 bpm (Quality 96%) | RR 16 br/min
Assessment: Resting rhythm regular, strong optical perfusion.
Plan: Continue current regimen. Follow up in 3 months.`;

    void navigator.clipboard.writeText(soapSnippet);
    setSoapCopied(true);
    setTimeout(() => setSoapCopied(false), 2400);
  };

  const goToStep = (index: number) => {
    setActiveStory(index);
    const story = storyRef.current;
    if (!story) return;
    const triggers = ScrollTrigger.getAll();
    const st = triggers.find((t) => t.trigger === story);
    if (st) {
      const scrollPos = st.start + (st.end - st.start) * (index / 2.1);
      window.scrollTo({ top: scrollPos + 2, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: { session } }) => setClinicianSignedIn(Boolean(session)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setClinicianSignedIn(Boolean(session)));
    return () => subscription.unsubscribe();
  }, []);

  useLayoutEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    const stage = story.querySelector<HTMLElement>('.v10-story-stage');
    const device = story.querySelector<HTMLElement>('.v10-device');
    const screens = gsap.utils.toArray<HTMLElement>('.v10-screen', story);
    const copies = gsap.utils.toArray<HTMLElement>('.v10-story-copy article', story);
    const progress = gsap.utils.toArray<HTMLElement>('.v10-story-progress i', story);
    if (!stage || !device || screens.length !== 3 || copies.length !== 3) return;

    const media = gsap.matchMedia();
    media.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
      let previousStep = 0;
      const context = gsap.context(() => {
        gsap.set([screens[1], screens[2], copies[1], copies[2]], { autoAlpha: 0, y: 28, scale: 0.985 });
        gsap.set([screens[0], copies[0]], { autoAlpha: 1, y: 0, scale: 1 });
        gsap.set(progress, { scaleX: 0.25, transformOrigin: 'left center' });
        gsap.set(progress[0], { scaleX: 1 });

        const timeline = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: story,
            start: 'top top',
            end: '+=220%',
            pin: stage,
            scrub: 0.45,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const nextStep = Math.min(2, Math.floor(self.progress * 3));
              if (nextStep !== previousStep) {
                previousStep = nextStep;
                setActiveStory(nextStep);
              }
            },
          },
        });

        timeline
          .to(device, { rotateX: -1.2, y: -8, duration: 0.18 }, 0)
          .to([screens[0], copies[0]], { autoAlpha: 0, y: -24, duration: 0.12 }, 0.25)
          .to([screens[1], copies[1]], { autoAlpha: 1, y: 0, scale: 1, duration: 0.15 }, 0.33)
          .to(progress[1], { scaleX: 1, duration: 0.1 }, 0.4)
          .to(device, { rotateX: 1, y: 6, duration: 0.22 }, 0.5)
          .to([screens[1], copies[1]], { autoAlpha: 0, y: -24, duration: 0.12 }, 0.63)
          .to([screens[2], copies[2]], { autoAlpha: 1, y: 0, scale: 1, duration: 0.15 }, 0.71)
          .to(progress[2], { scaleX: 1, duration: 0.1 }, 0.77)
          .to(device, { rotateX: 0, y: 0, duration: 0.23 }, 0.8);
      }, story);
      return () => context.revert();
    });
    return () => media.revert();
  }, []);

  if (clinicSlug) return <ClinicWebsitePage slug={clinicSlug} />;

  return <main className="ventricura-public home-v6">
    <Seo title="Ventricura | Contactless telehealth technology" description="Contactless rPPG technology for clinician-controlled telehealth and remote care." path="/" jsonLd={organizationSchema} />
    <PublicHeader />

    {activeAnnouncement && (
      <aside className="clinic-announcement-strip" aria-label="Practice announcement">
        <div className="clinic-site-wrapper clinic-announcement-inner">
          <span className="clinic-announcement-tag">
            <Sparkles size={12} /> Practice Announcement
          </span>
          <span>{activeAnnouncement}</span>
        </div>
      </aside>
    )}

    <section className="v6-hero">
      <div className="v6-grid" aria-hidden="true" />
      <div className="v6-hero-copy">
        <p className="v6-kicker">Remote care should feel<br />enabling, not limiting.</p>
        <h1>PATIENT CARE,<br />WITHOUT THE<br /><em>EXTRA SYSTEMS.</em></h1>
        <p className="v6-intro">Ventricura is a clinician-led telehealth workspace for the parts of care that happen before, during and after a video call.</p>
        <div className="v6-actions"><Link to="/contact">Talk to our team <ArrowRight size={17} /></Link><Link to="/demo">Open live demo <ArrowRight size={17} /></Link></div>
      </div>
      <aside className="v6-signal-module" aria-label="An illustrative live remote-care signal">
        <div className="v6-module-head"><span>CONSULTATION / LIVE</span><b>◉ ONLINE</b></div>
        <div className="v6-scope">
          <div className="v6-scope-ring v6-scope-ring-a" /><div className="v6-scope-ring v6-scope-ring-b" /><div className="v6-scope-core">V</div>
          <svg viewBox="0 0 360 90" aria-hidden="true"><path d="M0 48 H38 L54 39 L70 58 L95 18 L118 72 L143 47 H178 L202 42 L220 55 L243 26 L265 67 L291 47 H360" /></svg>
        </div>
        <div className="v6-module-data"><span><i />PATIENT LINK</span><span><i />VIDEO ROOM</span><span><i />RECORD READY</span></div>
      </aside>
    </section>

    <section className="v6-manifesto"><p>Not another layer of telehealth.</p><h2>A single <em>platform</em><br />for all telehealth needs.</h2></section>

    <section className="v10-story" ref={storyRef} aria-label="An interactive Ventricura consultation walkthrough">
      <div className="v10-story-stage">
        <div className="v10-story-frame">
          <div className="v10-device" data-active-stage={activeStory}>
            <div className="v10-device-bar"><span>VENTRICURA / CLINICAL SUITE</span><i>{workflow[activeStory]?.tab.toUpperCase() || 'SESSION'}</i></div>
            
            {/* Screen 1: The Patient Access & Browser Check */}
            <div className="v10-screen v10-screen-invite">
              <div className="v10-screen-content">
                <div className="v10-sms-card">
                  <div className="v10-sms-header">
                    <div className="v10-sms-sender">
                      <Smartphone size={12} />
                      <span>SMS · METRO HEALTH</span>
                    </div>
                    <span className="v10-sms-time">10:14 AM</span>
                  </div>
                  <div className="v10-sms-bubble">
                    <p>Hi Sarah, Dr. Stratford has opened your consultation room. Tap to join securely in your browser:</p>
                    <span className="v10-sms-link">ventricura.com/join/4829</span>
                  </div>
                </div>

                <div className="v10-browser-box">
                  <div className="v10-browser-bar">
                    <Lock size={11} />
                    <span className="v10-browser-url-text">ventricura.com/join/4829</span>
                    <span className="v10-secure-badge">ENCRYPTED</span>
                  </div>
                  <div className="v10-browser-inner">
                    <div className="v10-check-row">
                      <div className="v10-check-indicator">
                        <Camera size={13} />
                        <span>FaceTime HD Camera</span>
                      </div>
                      <span className="v10-status-chip">✓ Connected</span>
                    </div>
                    <div className="v10-check-row">
                      <div className="v10-check-indicator">
                        <Activity size={13} />
                        <span>Optical Lighting Level</span>
                      </div>
                      <span className="v10-status-chip">✓ Optimal</span>
                    </div>
                    <div className="v10-join-btn">
                      <span>Enter Consultation Room</span>
                      <ArrowRight size={13} />
                    </div>
                    <div className="v10-frictionless-footnote">
                      <span>ZERO APP DOWNLOADS</span>
                      <span>·</span>
                      <span>NO ACCOUNT REQUIRED</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Screen 2: Consultation & Real-time Contactless Vitals */}
            <div className="v10-screen v10-screen-consult">
              <div className="v10-screen-content v10-consult-grid">
                <div className="v10-tele-video">
                  <div className="v10-tele-header">
                    <span className="v10-live-indicator"><i /> LIVE CONSULTATION</span>
                    <span className="v10-tele-elapsed">14:20</span>
                  </div>
                  <div className="v10-patient-video-mock">
                    <div className="v10-face-silhouette">
                      <div className="v10-roi-target">
                        <span className="v10-roi-tag">rPPG ROI</span>
                      </div>
                    </div>
                  </div>
                  <div className="v10-tele-waveform">
                    <svg viewBox="0 0 300 48" className="v10-live-pulse-svg" aria-hidden="true">
                      <path d="M0 24 Q 20 24, 30 24 T 45 14 T 55 34 T 65 4 T 75 42 T 85 24 T 120 24 T 135 14 T 145 34 T 155 4 T 165 42 T 175 24 T 210 24 T 225 14 T 235 34 T 245 4 T 255 42 T 265 24 T 300 24" />
                    </svg>
                  </div>
                  <div className="v10-tele-metrics">
                    <div className="v10-metric-cell">
                      <small>HEART RATE</small>
                      <strong>72 <em>BPM</em></strong>
                    </div>
                    <div className="v10-metric-cell">
                      <small>RESPIRATION</small>
                      <strong>16 <em>BR/MIN</em></strong>
                    </div>
                    <div className="v10-metric-cell">
                      <small>SIGNAL SNR</small>
                      <strong className="v10-highlight-metric">96% <em>SNR</em></strong>
                    </div>
                  </div>
                </div>

                <div className="v10-tele-notes">
                  <div className="v10-notes-title">
                    <span>SARAH JENKINS (42)</span>
                    <span className="v10-sync-tag">IN CONSULT</span>
                  </div>
                  <div className="v10-notes-content">
                    <div className="v10-note-line">
                      <b>S:</b> Palpitations post-exercise.
                    </div>
                    <div className="v10-note-line">
                      <b>O:</b> Optical pulse 72 bpm steady, regular rhythm, SNR +14dB.
                    </div>
                  </div>
                  <div className="v10-notes-averaging">
                    <span className="v10-averaging-pulse" />
                    <span>30s Quality-Weighted Rolling Window</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Screen 3: 1-Click EHR Export & Hand-off */}
            <div className="v10-screen v10-screen-record">
              <div className="v10-screen-content v10-record-grid">
                <div className="v10-encounter-card">
                  <div className="v10-enc-header">
                    <div>
                      <span className="v10-enc-kicker">ENCOUNTER SUMMARY · #VN-8429</span>
                      <h4>Dr. Ramsay Stratford</h4>
                      <small>Metro Health · Patient: Sarah Jenkins (DOB: 14/08/1984)</small>
                    </div>
                    <span className="v10-enc-badge">CONSULT COMPLETE</span>
                  </div>
                  <div className="v10-enc-stats">
                    <div className="v10-stat-box">
                      <small>Mean HR</small>
                      <b>72 BPM</b>
                    </div>
                    <div className="v10-stat-box">
                      <small>Mean Resp</small>
                      <b>16 br/min</b>
                    </div>
                    <div className="v10-stat-box">
                      <small>Confidence</small>
                      <b className="v10-high-conf">96% High</b>
                    </div>
                  </div>
                </div>

                <div className="v10-record-actions">
                  <button 
                    type="button" 
                    className={`v10-soap-copy-btn ${soapCopied ? 'copied' : ''}`}
                    onClick={handleCopySoap}
                  >
                    {soapCopied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{soapCopied ? 'Copied to Clipboard!' : 'Copy Formatted Note for EHR'}</span>
                  </button>
                  <div className="v10-pdf-btn">
                    <FileText size={14} />
                    <span>Signed A4 PDF</span>
                  </div>
                </div>

                <div className="v10-ehr-preview">
                  <div className="v10-ehr-bar">
                    <span>CLIPBOARD FORMAT (READY FOR BEST PRACTICE / EPIC)</span>
                    {soapCopied && <span className="v10-copied-alert">✓ COPIED</span>}
                  </div>
                  <pre className="v10-ehr-snippet">
{`VENTRICURA ENCOUNTER — #VN-8429
Patient: Sarah Jenkins (DOB: 14/08/1984)
Vitals (30s rPPG): HR 72 bpm (Quality 96%) | RR 16 br/min
Assessment: Resting rhythm regular, strong optical perfusion.
Plan: Continue current regimen. Follow up in 3 months.`}
                  </pre>
                </div>
              </div>
            </div>

            <div className="v10-device-status">
              <span><i />PATIENT ACCESS</span>
              <span><i />LIVE TELEMETRY</span>
              <span><i />EHR EXPORT</span>
            </div>
          </div>

          <div className="v10-story-copy">
            <div className="v10-step-tabs" role="tablist" aria-label="Consultation walkthrough stages">
              {workflow.map((item, index) => (
                <button
                  key={item.step}
                  type="button"
                  role="tab"
                  aria-selected={activeStory === index}
                  className={`v10-tab-btn ${activeStory === index ? 'active' : ''}`}
                  onClick={() => goToStep(index)}
                >
                  <span>{item.step}</span>
                  <b>{item.tab}</b>
                </button>
              ))}
            </div>

            {workflow.map((item, index) => (
              <article key={item.step} className={activeStory === index ? 'active' : ''}>
                <span>{item.tag}</span>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
                <ul className="v10-pill-list">
                  {item.pills.map((pill) => (
                    <li key={pill}>
                      <Check size={13} />
                      <span>{pill}</span>
                    </li>
                  ))}
                </ul>
                <b>{index === 2 ? 'Encounter complete · Ready for EHR' : 'Click a stage above or scroll to advance'}</b>
              </article>
            ))}
          </div>
        </div>
        <div className="v10-story-progress" aria-hidden="true">
          <i className={activeStory >= 0 ? 'active' : ''} />
          <i className={activeStory >= 1 ? 'active' : ''} />
          <i className={activeStory >= 2 ? 'active' : ''} />
        </div>
      </div>
    </section>

    <section className="v6-workspace">
      <div className="v6-workspace-title"><h2>Less switching.<br /><em>More attention.</em></h2><p>Appointments, patient history, consultation notes and session review are designed to sit together—rather than get lost across separate tools.</p></div>
      <div className="v6-workspace-surface">
        <div className="v6-surface-bar"><span>VENTRICURA / CLINIC WORKSPACE</span><i>SECURE SESSION</i></div>
        <div className="v6-surface-main"><div><small>PATIENT HISTORY</small><strong>Every appointment.<br />One continuous record.</strong></div><ul><li><span>APPOINTMENT</span><b>Booking & access</b></li><li><span>CONSULTATION</span><b>Notes & video session</b></li><li><span>REVIEW</span><b>Waveform & PDF export</b></li></ul></div>
        <Link to={clinicianSignedIn ? '/clinician' : '/clinician/sign-in'}>{clinicianSignedIn ? 'Open clinician workspace' : 'Explore clinician access'} <ArrowRight size={17} /></Link>
      </div>
    </section>

    <section className="v6-demo">
      <h2>See contactless care<br /><em>in motion.</em></h2>
      <p>Experience how browser-based optical capture measures vitals in real time—with zero external devices or downloads required.</p>
      <Link to="/demo">Try the live demo <ArrowRight size={20} /></Link>
    </section>

    <section className="v6-close"><span>Ventricura is for practices ready to try a more connected way to consult remotely.</span><Link to="/contact">Start a clinic conversation <ArrowRight size={22} /></Link></section>
    <PublicFooter />
  </main>;
}
