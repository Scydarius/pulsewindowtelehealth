import { Camera, CircleStop, LoaderCircle, Play, ScanFace, ShieldCheck, Waves } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicHeader } from './TechnologyPage';
import { PublicFooter, Seo } from '../components/PublicSite';

type Stage = 'idle' | 'permission' | 'connecting' | 'positioning' | 'measuring' | 'complete' | 'error';
type Reading = { bpm: number | null; respiratoryRate: number | null; quality: number; snr: number | null; latency: number | null; faceDetected: boolean; motionDetected: boolean; valid: boolean; state: string; waveform: number[]; spectrum: number[] };
const emptyReading: Reading = { bpm: null, respiratoryRate: null, quality: 0, snr: null, latency: null, faceDetected: false, motionDetected: false, valid: false, state: 'READY', waveform: [], spectrum: [] };

function chartPath(series: number[], width = 640, height = 170) {
  if (series.length < 2) return '';
  const min = Math.min(...series); const max = Math.max(...series); const range = Math.max(max - min, .0001);
  return series.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index / (series.length - 1)) * width} ${height - 20 - ((value - min) / range) * (height - 40)}`).join(' ');
}
function metric(value: number | null, digits = 0) { return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits); }

export function LiveDemoPage() {
  const videoRef = useRef<HTMLVideoElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); const streamRef = useRef<MediaStream | null>(null); const socketRef = useRef<WebSocket | null>(null); const intervalRef = useRef<number | null>(null); const sessionTimerRef = useRef<number | null>(null); const busyRef = useRef(false); const finishedRef = useRef(false); const measurementStartedRef = useRef<number | null>(null);
  const latestSessionBpmRef = useRef<number | null>(null);
  const latestSessionBrpmRef = useRef<number | null>(null);
  const [stage, setStage] = useState<Stage>('idle'); const [status, setStatus] = useState('Camera off — start when you are ready.'); const [reading, setReading] = useState<Reading>(emptyReading); const [seconds, setSeconds] = useState(0);
  const running = stage === 'permission' || stage === 'connecting' || stage === 'positioning' || stage === 'measuring';
  const stop = useCallback((nextStatus = 'Camera off — start when you are ready.') => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    if (sessionTimerRef.current !== null) window.clearTimeout(sessionTimerRef.current);
    intervalRef.current = null; sessionTimerRef.current = null; socketRef.current?.close(); socketRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    finishedRef.current = true; measurementStartedRef.current = null; setSeconds(0); setStage('idle'); setStatus(nextStatus);
  }, []);
  const finishSession = useCallback(() => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = null; sessionTimerRef.current = null; socketRef.current?.close(); socketRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    finishedRef.current = true; measurementStartedRef.current = null; setSeconds(30); setStage('complete'); setStatus('30-second session complete — your camera has been turned off.');
    if (latestSessionBpmRef.current !== null || latestSessionBrpmRef.current !== null) {
      setReading((prev) => ({
        ...prev,
        bpm: latestSessionBpmRef.current ?? prev.bpm,
        respiratoryRate: latestSessionBrpmRef.current ?? prev.respiratoryRate,
      }));
    }
  }, []);
  useEffect(() => () => stop(), [stop]);

  const transmit = useCallback(() => {
    const video = videoRef.current; const canvas = canvasRef.current; const socket = socketRef.current;
    if (!video || !canvas || !socket || socket.readyState !== WebSocket.OPEN || video.readyState < 2 || busyRef.current || socket.bufferedAmount > 128_000) return;
    canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d'); if (!context) return;
    context.drawImage(video, 0, 0, 640, 480); busyRef.current = true;
    canvas.toBlob((blob) => { busyRef.current = false; if (blob && socket.readyState === WebSocket.OPEN) socket.send(blob); }, 'image/jpeg', .75);
  }, []);

  const receive = useCallback((data: Record<string, unknown>) => {
    if (finishedRef.current) return;
    const cardiac = (data.cardiac ?? {}) as Record<string, unknown>; const respiration = (data.respiration ?? {}) as Record<string, unknown>;
    const bpmRaw = cardiac.clinical_bpm ?? cardiac.bpm;
    const brpmRaw = respiration.clinical_brpm ?? respiration.brpm;
    const bpm = Number(bpmRaw); const respiratoryRate = Number(brpmRaw); const valid = data.is_valid_readout === true && Number.isFinite(bpm);
    if (cardiac.session_average_bpm != null && Number.isFinite(Number(cardiac.session_average_bpm))) {
      latestSessionBpmRef.current = Number(cardiac.session_average_bpm);
    }
    if (respiration.session_average_brpm != null && Number.isFinite(Number(respiration.session_average_brpm))) {
      latestSessionBrpmRef.current = Number(respiration.session_average_brpm);
    }
    const next: Reading = { bpm: Number.isFinite(bpm) ? bpm : null, respiratoryRate: Number.isFinite(respiratoryRate) ? respiratoryRate : null, quality: Number(data.quality_score ?? 0), snr: Number.isFinite(Number(data.snr_db)) ? Number(data.snr_db) : null, latency: Number.isFinite(Number(data.processing_latency_ms)) ? Number(data.processing_latency_ms) : null, faceDetected: data.face_detected === true, motionDetected: data.motion_detected === true, valid, state: String(data.tracking_state ?? 'CALIBRATING'), waveform: Array.isArray(cardiac.waveform) ? cardiac.waveform.map(Number).filter(Number.isFinite) : [], spectrum: Array.isArray(data.cardiac_spectrum_power) ? data.cardiac_spectrum_power.map(Number).filter(Number.isFinite) : [] };
    setReading(next);
    if (!next.faceDetected) { setStage('positioning'); setStatus('Position your face inside the guide.'); return; }
    if (!next.valid) { setStage('positioning'); setStatus(next.motionDetected ? 'Hold still while the signal settles.' : 'Establishing the live optical signal…'); return; }
    if (!measurementStartedRef.current) { measurementStartedRef.current = Date.now(); sessionTimerRef.current = window.setTimeout(finishSession, 30_000); }
    const elapsed = Math.min(30, Math.round((Date.now() - measurementStartedRef.current) / 1000));
    setSeconds(elapsed);
    setStage('measuring'); setStatus('Live signal connected — collecting the 30-second session.');
  }, [finishSession]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setStage('error'); setStatus('This browser does not provide camera access.'); return; }
    try {
      finishedRef.current = false; latestSessionBpmRef.current = null; latestSessionBrpmRef.current = null; setStage('permission'); setStatus('Approve camera access in your browser.'); setReading(emptyReading); setSeconds(0);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
      streamRef.current = stream; if (!videoRef.current) throw new Error('Camera preview is unavailable.'); videoRef.current.srcObject = stream; await videoRef.current.play();
      setStage('connecting'); setStatus('Opening a short-lived, secure signal session…');
      const response = await fetch('/api/rppg-ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'showcase' }) });
      const ticket = await response.json().catch(() => ({})) as { websocketUrl?: string; error?: string };
      if (!response.ok || !ticket.websocketUrl) throw new Error(ticket.error ?? 'The live demo is not configured.');
      const socket = new WebSocket(ticket.websocketUrl); socketRef.current = socket;
      socket.addEventListener('message', (event) => { try { const data = JSON.parse(event.data) as Record<string, unknown>; if (data.type === 'ready') { setStage('positioning'); setStatus('Camera connected — position your face in the guide.'); intervalRef.current = window.setInterval(transmit, 1000 / 30); } else if (data.type === 'telemetry') receive(data); else if (data.type === 'error') { stop(String(data.message ?? 'The live signal session could not start.')); setStage('error'); } } catch { /* Ignore non-telemetry socket data. */ } });
      socket.addEventListener('error', () => { stop('The live signal service could not be opened.'); setStage('error'); });
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setStage('error');
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow it in the address bar, then try again.' : error instanceof Error ? error.message : 'The camera could not start.');
    }
  };
  const progress = Math.min(100, (seconds / 30) * 100); const waveform = chartPath(reading.waveform); const spectrum = chartPath(reading.spectrum);
  const stageLabel = stage === 'idle' ? 'OFF' : stage === 'permission' || stage === 'connecting' ? 'CONNECTING' : stage === 'measuring' ? 'LIVE' : stage === 'complete' ? 'COMPLETE' : stage === 'error' ? 'NEEDS ATTENTION' : 'POSITIONING';

  return <main className="ventricura-public demo-page-v2"><Seo title="Live rPPG demo | Ventricura" description="Try Ventricura’s contactless rPPG demo using a guided camera session." path="/demo" /><PublicHeader />
    <section className="demo-intro"><div><p className="mono-kicker">VENTRICURA LIVE SIGNAL DEMO</p><h1>See the signal in motion.</h1><p>This public demo opens a short-lived session to the rPPG signal service. It is a technology demonstration, not a medical assessment.</p></div><div className={`demo-state state-${stage.toLowerCase()}`}><i /><span>{stageLabel}</span><strong>{status}</strong></div></section>
    <section className="demo-console">
      <div className="demo-camera-stage"><video ref={videoRef} autoPlay muted playsInline />{!running && <div className="demo-face-guide"><ScanFace /><strong>Position your face here</strong><span>Keep your forehead and cheeks inside the frame.</span></div>}{running && <div className="demo-live-overlay"><span className={reading.faceDetected ? 'face-found' : ''} /><small>{reading.faceDetected ? 'FACE TRACKED' : 'FINDING FACE'}</small></div>}<canvas ref={canvasRef} hidden /></div>
      <aside className="demo-sidepanel"><div className="demo-cta">{running ? <button type="button" onClick={() => stop()}><CircleStop size={17} /> End live demo</button> : <button type="button" onClick={() => void start()}><Play size={17} /> {stage === 'complete' ? 'Run another demo' : stage === 'error' ? 'Try again' : 'Start live demo'}</button>}<span><Camera size={14} /> Browser camera required</span></div><div className="demo-progress"><div><span>STABLE SESSION</span><strong>{seconds}/30 s</strong></div><i><b style={{ width: `${progress}%` }} /></i><small>{stage === 'complete' ? 'Complete. The camera and live session are off.' : 'The timer begins only once the live engine reports a usable readout.'}</small></div><div className="demo-readings">
  <article>
    <span>{stage === 'complete' ? '30S SESSION AVERAGE' : 'HEART RATE (30S AVG)'}</span>
    <strong>{metric(reading.valid ? reading.bpm : null)}<em>BPM</em></strong>
    <p className="reading-subtitle">{stage === 'complete' ? 'Locked 30s clinical average' : 'Quality-weighted rolling avg'}</p>
  </article>
  <article>
    <span>{stage === 'complete' ? '30S SESSION AVERAGE' : 'RESPIRATION (30S AVG)'}</span>
    <strong>{metric(reading.valid ? reading.respiratoryRate : null)}<em>BR/MIN</em></strong>
    <p className="reading-subtitle">{stage === 'complete' ? 'Locked 30s clinical average' : 'Quality-weighted rolling avg'}</p>
  </article>
</div><dl><div><dt>Tracking</dt><dd>{reading.state}</dd></div><div><dt>Signal quality</dt><dd>{Math.round(Math.max(0, reading.quality) * 100)}%</dd></div><div><dt>SNR</dt><dd>{reading.snr === null ? '—' : `${reading.snr.toFixed(1)} dB`}</dd></div><div><dt>Latency</dt><dd>{reading.latency === null ? '—' : `${Math.round(reading.latency)} ms`}</dd></div></dl></aside>
      <section className="demo-plots"><SignalPlot title="OPTICAL PLETHYSMOGRAM" unit="Normalised amplitude (a.u.)" path={waveform} status={reading.waveform.length ? 'Live trace' : 'Awaiting signal'} /><SignalPlot title="CARDIAC POWER SPECTRUM" unit="Normalised power" path={spectrum} status={reading.spectrum.length ? 'Live spectrum' : 'Awaiting signal'} tone="spectrum" /></section>
    </section>
    <section className="demo-security"><ShieldCheck /><span>Camera frames are sent during this active session only. The browser receives a short-lived ticket; no permanent rPPG key is exposed here.</span><Waves /></section><PublicFooter />
  </main>;
}

function SignalPlot({ title, unit, path, status, tone = 'wave' }: { title: string; unit: string; path: string; status: string; tone?: 'wave' | 'spectrum' }) {
  return <article className={`demo-plot ${tone}`}><div><span>{title}</span><strong>{status}</strong></div><svg viewBox="0 0 640 170" role="img" aria-label={`${title} chart`}><line x1="0" y1="85" x2="640" y2="85" />{path ? <path d={path} /> : <text x="320" y="90" textAnchor="middle">Awaiting live engine telemetry</text>}</svg><footer><span>0 s</span><span>{unit}</span><span>Latest</span></footer></article>;
}
