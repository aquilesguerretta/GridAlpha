import { Card } from '@/react-app/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  unit: string;
  trend?: number;
  icon?: React.ReactNode;
  subtitle?: string;
  /** Fix 5: Small text below card title (e.g. "Real-time price") */
  titleSubtitle?: string;
}

export default function KpiCard({ title, value, unit, trend, icon, subtitle, titleSubtitle }: KpiCardProps) {
  return (
    <Card className="relative overflow-hidden p-6 pt-12 pr-12 bg-card border-border backdrop-blur-sm">
      {icon && (
        <div
          className="absolute top-3 right-3 size-7 flex items-center justify-center text-primary/20 [&>svg]:size-7"
          aria-hidden
        >
          {icon}
        </div>
      )}
      <div className="flex flex-col">
        <p className={`text-muted-foreground text-sm font-medium ${titleSubtitle ? 'mb-0.5' : 'mb-2'}`}>{title}</p>
        {titleSubtitle && (
          <p className="text-xs text-muted-foreground mb-2 font-normal">{titleSubtitle}</p>
        )}
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
    </Card>
  );
}
