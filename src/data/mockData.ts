export type Appointment = {
  id: string;
  patient: string;
  clinician: string;
  dateLabel: string;
  timeLabel: string;
  reason: string;
  status: 'upcoming' | 'ready' | 'complete';
};

export type MeasurementRecord = {
  id: string;
  label: string;
  date: string;
  heartRate: number;
  respiratoryRate: number | null;
  quality: 'Good' | 'Acceptable';
  context: string;
};

export const nextAppointment: Appointment = {
  id: 'appt-1042',
  patient: 'Claire Williams',
  clinician: 'Dr Maya Patel',
  dateLabel: 'Today',
  timeLabel: '2:30 pm',
  reason: 'Medication follow-up',
  status: 'ready',
};

export const measurements: MeasurementRecord[] = [
  {
    id: 'm-3',
    label: 'Before medication',
    date: 'Today, 8:12 am',
    heartRate: 68,
    respiratoryRate: 15,
    quality: 'Good',
    context: 'Before morning dose',
  },
  {
    id: 'm-2',
    label: 'Scheduled check-in',
    date: 'Yesterday, 5:40 pm',
    heartRate: 72,
    respiratoryRate: 16,
    quality: 'Good',
    context: 'Eight hours after dose',
  },
  {
    id: 'm-1',
    label: 'Baseline',
    date: '21 Sep, 9:04 am',
    heartRate: 70,
    respiratoryRate: null,
    quality: 'Acceptable',
    context: 'Initial reading',
  },
];

export const clinicianAppointments: Appointment[] = [
  nextAppointment,
  {
    id: 'appt-1043',
    patient: 'Jon Bell',
    clinician: 'Dr Maya Patel',
    dateLabel: 'Today',
    timeLabel: '3:15 pm',
    reason: 'Post-operative review',
    status: 'upcoming',
  },
  {
    id: 'appt-1044',
    patient: 'Amelia Chen',
    clinician: 'Dr Maya Patel',
    dateLabel: 'Tomorrow',
    timeLabel: '9:00 am',
    reason: 'Dose adjustment review',
    status: 'upcoming',
  },
];
