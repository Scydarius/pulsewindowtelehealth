import { Activity, Wind } from 'lucide-react';
import { measurements } from '../data/mockData';
import { StatusPill } from './StatusPill';

export function MeasurementHistory() {
  return (
    <section className="panel" id="measurements">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Recent readings</p>
          <h2>Measurement history</h2>
        </div>
        <button className="text-button">View all</button>
      </div>

      <div className="measurement-list">
        {measurements.map((measurement) => (
          <article className="measurement-row" key={measurement.id}>
            <div className="measurement-title">
              <strong>{measurement.label}</strong>
              <span>{measurement.date} · {measurement.context}</span>
            </div>
            <div className="metric-inline">
              <Activity size={18} />
              <strong>{measurement.heartRate}</strong>
              <span>BPM</span>
            </div>
            <div className="metric-inline">
              <Wind size={18} />
              <strong>{measurement.respiratoryRate ?? '—'}</strong>
              <span>breaths/min</span>
            </div>
            <StatusPill tone={measurement.quality === 'Good' ? 'green' : 'amber'}>
              {measurement.quality}
            </StatusPill>
          </article>
        ))}
      </div>
    </section>
  );
}
