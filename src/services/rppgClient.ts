export type MeasurementStatus = 'idle' | 'preparing' | 'measuring' | 'complete' | 'failed';

export type MeasurementUpdate = {
  status: MeasurementStatus;
  progress: number;
  signalQuality: number;
  heartRateBpm: number | null;
  respiratoryRate: number | null;
  message: string;
  algorithmVersion?: string;
};

export interface RppgClient {
  startMeasurement(onUpdate: (update: MeasurementUpdate) => void): Promise<() => void>;
}

const apiUrl = import.meta.env.VITE_RPPG_API_URL ?? 'http://localhost:8000/api/v1';

class MockRppgClient implements RppgClient {
  async startMeasurement(onUpdate: (update: MeasurementUpdate) => void) {
    let progress = 0;
    let cancelled = false;

    onUpdate({
      status: 'preparing',
      progress,
      signalQuality: 0,
      heartRateBpm: null,
      respiratoryRate: null,
      message: 'Checking lighting and face position…',
    });

    const interval = window.setInterval(() => {
      if (cancelled) return;
      progress = Math.min(progress + 4, 100);
      const complete = progress === 100;
      const wave = Math.sin(progress / 7);

      onUpdate({
        status: complete ? 'complete' : 'measuring',
        progress,
        signalQuality: Math.min(0.94, 0.55 + progress / 260),
        heartRateBpm: progress > 20 ? Math.round(72 + wave * 2) : null,
        respiratoryRate: complete ? 15 : null,
        message: complete ? 'Measurement complete' : 'Keep still and breathe normally',
        algorithmVersion: complete ? 'demo-0.1.0' : undefined,
      });

      if (complete) window.clearInterval(interval);
    }, 320);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }
}

class WebSocketRppgClient implements RppgClient {
  async startMeasurement(onUpdate: (update: MeasurementUpdate) => void) {
    const response = await fetch(`${apiUrl}/measurement-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics: ['heart_rate', 'respiratory_rate'] }),
    });

    if (!response.ok) throw new Error('Unable to create a measurement session.');
    const session = (await response.json()) as { sessionId: string; websocketUrl?: string };
    const websocketUrl = session.websocketUrl ?? `${apiUrl.replace(/^http/, 'ws')}/measurement-sessions/${session.sessionId}/stream`;
    const socket = new WebSocket(websocketUrl);

    socket.addEventListener('message', (event) => {
      onUpdate(JSON.parse(event.data) as MeasurementUpdate);
    });
    socket.addEventListener('error', () => {
      onUpdate({
        status: 'failed',
        progress: 0,
        signalQuality: 0,
        heartRateBpm: null,
        respiratoryRate: null,
        message: 'The measurement service is unavailable. The consultation can continue.',
      });
    });

    return () => socket.close();
  }
}

export const rppgClient: RppgClient = import.meta.env.VITE_USE_MOCK_RPPG === 'false'
  ? new WebSocketRppgClient()
  : new MockRppgClient();
