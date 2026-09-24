type StatusPillProps = {
  tone?: 'green' | 'amber' | 'neutral' | 'coral';
  children: React.ReactNode;
};

export function StatusPill({ tone = 'neutral', children }: StatusPillProps) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}
