type StatusPillProps = {
  tone?: 'active' | 'muted' | 'neutral' | 'alert';
  children: React.ReactNode;
};

export function StatusPill({ tone = 'neutral', children }: StatusPillProps) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}
