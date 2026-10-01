export interface CardiacData {
  bpm: number | null;                                    // null during 30s calibration
  clinical_bpm: number | null;                           // 30s quality-weighted rolling average
  session_average_bpm: number | null;                    // 30s rolling average for clinical consults
  confidence_interval_bpm: number;
  kalman_bpm: number;
  hrv_rmssd_ms: number | null;
  hrv_sdnn_ms: number | null;
  hrv_pnn50_pct: number | null;
  hrv_lf_hf_ratio: number | null;
  stress_index: number | null;
  stress_score: number | null;
  stress_level: 'Low' | 'Normal' | 'Moderate' | 'High';
  peak_freq_hz: number;
  waveform_sample: number;
  waveform: number[];
}

export interface RespirationData {
  brpm: number | null;                                   // null during 30s calibration
  clinical_brpm: number | null;                          // 30s quality-weighted rolling average
  session_average_brpm: number | null;
  freq_hz: number | null;
  phase: 'Inhaling' | 'Exhaling' | 'Holding' | 'Apnea / Hold';
  phase_pct: number;
  depth: 'Normal' | 'Deep' | 'Shallow';
  is_apnea: boolean;
  ie_ratio: string;
  rqi_pct: number;
  rrv_sdnn_s: number | null;
  rsa_gain_bpm: number | null;
  volumetric_symmetry: string;
  speech_detected: boolean;
  burg_pole_radius: number | null;
  burg_pole_freq: number | null;
  waveform_sample: number;
  waveform: number[];
}

export interface TelemetryDiagnostics {
  is_calibrated: boolean;
  calibration_progress_pct: number;
  calibration_seconds_remaining: number;
  calibration_seconds_elapsed: number;
  calibration_duration_seconds: number;
  motion_velocity: number;
  motion_displacement_px: number;
  spectral_entropy: number;
  skin_pixels: number;
  landmarks_detected: number;
  confidence_interval_bpm: number;
  kalman_bpm: number;
  algorithm?: string;
  buffer_samples?: number;
  buffer_capacity?: number;
}

export interface TelemetryPayload {
  type: 'telemetry';
  timestamp: number;
  session_id: string;
  frame_index: number;
  face_detected: boolean;
  motion_detected: boolean;
  tracking_state: 'SEARCHING' | 'CALIBRATING' | 'LOCKED' | 'HOLDING';
  is_valid_readout: boolean;                             // false during calibration
  snr_db: number;
  quality_score: number;
  cardiac: CardiacData;
  respiration: RespirationData;
  roi_weights: Record<string, number>;
  ambient_canceling: boolean;
  ambient_cancellation_db: number;
  processing_latency_ms: number;
  diagnostics: TelemetryDiagnostics;
  cardiac_spectrum_power?: number[];
  cardiac_spectrum_freq_hz?: number[];
  respiration_spectrum_power?: number[];
  respiration_spectrum_freq_hz?: number[];
}
