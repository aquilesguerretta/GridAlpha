import { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from './ui/card';

interface KpiCardProps {
  title: string;
  value: string;
  unit?: string;
  trend?: number;
  icon?: ReactNode;
  subtitle?: string;
}

export default function KpiCard({ title, value, unit, trend, icon, subtitle }: KpiCardProps) {
  const positive = trend !== undefined && trend >= 0;
  return (
    <Card className="p-6 bg-card border-border backdrop-blur-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-muted-foreground text-sm font-medium mb-2">{title}</p>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold tracking-tight">{value}</span>
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-medium ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
              {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend).toFixed(1)}%
            </div>
          )}
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="text-primary/30">{icon}</div>}
      </div>
    </Card>
  );
}
