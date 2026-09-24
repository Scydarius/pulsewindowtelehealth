import { Activity, ArrowRight, CalendarClock, Search, UsersRound, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusPill } from '../components/StatusPill';
import { clinicianAppointments } from '../data/mockData';

export function ClinicianPage() {
  return (
    <div className="dashboard-page">
      <section className="page-intro clinician-intro">
        <div><p className="eyebrow">Clinician workspace</p><h1>Today’s consultations</h1><p>Review patient context and measurements alongside the video appointment.</p></div>
        <label className="search-field"><Search size={18} /><input aria-label="Search patients" placeholder="Search patients" /></label>
      </section>

      <section className="summary-strip">
        <article><div><CalendarClock /></div><span><strong>3</strong>Appointments today</span></article>
        <article><div><UsersRound /></div><span><strong>8</strong>Patients monitored</span></article>
        <article><div><Activity /></div><span><strong>2</strong>Readings to review</span></article>
      </section>

      <section className="panel" id="appointments">
        <div className="section-heading"><div><p className="eyebrow">Schedule</p><h2>Upcoming appointments</h2></div><button className="button button-secondary">New appointment</button></div>
        <div className="appointment-table">
          {clinicianAppointments.map((appointment, index) => (
            <article className="appointment-row" key={appointment.id}>
              <div className="patient-avatar">{appointment.patient.split(' ').map((part) => part[0]).join('')}</div>
              <div><strong>{appointment.patient}</strong><span>{appointment.reason}</span></div>
              <div><strong>{appointment.timeLabel}</strong><span>{appointment.dateLabel}</span></div>
              <StatusPill tone={appointment.status === 'ready' ? 'green' : 'neutral'}>{appointment.status === 'ready' ? 'Ready' : 'Upcoming'}</StatusPill>
              {index === 0 ? (
                <Link className="button button-primary button-small" to={`/consultation/${appointment.id}?role=clinician`}><Video size={17} /> Start call</Link>
              ) : (
                <button className="icon-button" aria-label={`Open ${appointment.patient}`}><ArrowRight size={19} /></button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="clinician-lower-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Follow-up</p><h2>Measurements to review</h2></div></div>
          <div className="review-card"><div className="patient-avatar coral">JW</div><div><strong>Jon Bell</strong><span>Pulse increased 14 BPM from baseline</span></div><StatusPill tone="amber">Review</StatusPill></div>
          <div className="review-card"><div className="patient-avatar">CW</div><div><strong>Claire Williams</strong><span>Scheduled pre-dose reading received</span></div><StatusPill tone="green">Stable</StatusPill></div>
        </article>
        <article className="panel platform-note"><p className="eyebrow">PulseWindow</p><h2>Measurement context, not a diagnosis.</h2><p>Use signal quality, medication timing and longitudinal trends to support your assessment. Experimental readings should be verified using approved clinical devices.</p></article>
      </section>
    </div>
  );
}
