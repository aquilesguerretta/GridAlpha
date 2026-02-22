import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Card } from './ui/card';

interface Props {
  score: number;
  rmrStatus: boolean;
  zoneName: string;
}

export default function ReliabilityGauge({ score, rmrStatus, zoneName }: Props) {
  const pct   = (score / 10) * 100;
  const color = score <= 3 ? '#10b981' : score <= 6 ? '#eab308' : '#ef4444';
  const label = score <= 3 ? 'Adequate' : score <= 6 ? 'Moderate Risk' : 'Critical';
  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-3 mb-4">
        {rmrStatus ? <ShieldAlert className="w-5 h-5 text-red-500" /> : <ShieldCheck className="w-5 h-5 text-emerald-500" />}
        <h3 className="text-lg font-semibold">Reliability Score — {zoneName}</h3>
        {rmrStatus && <span className="ml-auto text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">RMR Active</span>}
      </div>
      <div className="flex items-end gap-4 mb-3">
        <span className="text-5xl font-bold" style={{ color }}>{score}</span>
        <span className="text-muted-foreground text-sm mb-1">/ 10 — {label}</span>
      </div>
      <div className="h-3 bg-secondary rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs text-muted-foreground mt-2">Higher score = greater capacity shortfall risk</p>
    </Card>
  );
}
