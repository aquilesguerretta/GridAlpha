import { Card } from '@/react-app/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  unit: string;
  trend?: number;
  icon?: React.ReactNode;
  subtitle?: string;
}

export default function KpiCard({ title, value, unit, trend, icon, subtitle }: KpiCardProps) {
  return (
    <Card className="px-6 pt-8 pb-6 pr-10 bg-card border-border backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-muted-foreground text-sm font-medium mb-2">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight">{value}</span>
            <span className="text-lg text-muted-foreground">{unit}</span>
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1 font-medium">{subtitle}</p>
          )}
          {trend !== undefined && (
            <div className={`flex items-center gap-1 mt-3 text-sm ${trend >= 0 ? 'text-secondary' : 'text-destructive'}`}>
              {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="text-primary/20 shrink-0 size-10 flex items-center justify-center [&>svg]:size-full [&>svg]:max-w-full [&>svg]:max-h-full">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
