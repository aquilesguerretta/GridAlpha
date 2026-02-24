import { Card } from '@/react-app/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface ReliabilityGaugeProps {
  score: number; // 0-10
  rmrStatus: boolean;
  zoneName: string;
}

export default function ReliabilityGauge({ score, rmrStatus, zoneName }: ReliabilityGaugeProps) {
  const isHighRisk = score > 7;
  const percentage = (score / 10) * 100;
  
  // Dynamic risk tagging logic
  let riskTag = null;
  let riskTagClass = '';
  let shouldPulse = false;
  
  if (score > 8.0) {
    riskTag = 'CRITICAL: RMR RISK';
    riskTagClass = 'bg-red-500/20 border-red-500 text-red-500';
    shouldPulse = true;
  } else if (score >= 6.0 && score <= 8.0) {
    riskTag = 'TIGHTENING SUPPLY';
    riskTagClass = 'bg-yellow-500/20 border-yellow-500 text-yellow-500';
  } else if (score < 4.0) {
    riskTag = 'PIPELINE HEALTHY';
    riskTagClass = 'bg-emerald-500/20 border-emerald-500 text-emerald-500';
  }
  
  // Determine risk level and colors
  let riskLevel = 'Low Risk';
  let riskColor = 'text-emerald-500';
  let gaugeColor = 'text-emerald-500';
  let bgGradient = 'from-emerald-500/20 to-emerald-500/5';
  
  if (score > 7) {
    riskLevel = 'Supply Deficit';
    riskColor = 'text-red-500';
    gaugeColor = 'text-red-500';
    bgGradient = 'from-red-500/20 to-red-500/5';
  } else if (score > 5) {
    riskLevel = 'Moderate Risk';
    riskColor = 'text-yellow-500';
    gaugeColor = 'text-yellow-500';
    bgGradient = 'from-yellow-500/20 to-yellow-500/5';
  }
  
  return (
    <Card className={`p-8 bg-gradient-to-br ${bgGradient} border-2 ${isHighRisk ? 'border-red-500/50' : 'border-border'} backdrop-blur-sm relative overflow-hidden`}>
      {/* Pulsing effect for high risk */}
      {isHighRisk && (
        <div className="absolute inset-0 bg-red-500/10 animate-pulse" />
      )}
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">Reliability Risk Gauge</h3>
            <p className="text-sm text-muted-foreground">{zoneName}</p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {rmrStatus && (
              <div className="px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/50">
                <span className="text-xs font-bold text-orange-500">RMR STATUS</span>
              </div>
            )}
            {riskTag && (
              <div className={`px-3 py-1 rounded-full border-2 ${riskTagClass} ${shouldPulse ? 'animate-pulse' : ''}`}>
                <span className="text-xs font-bold">{riskTag}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Circular gauge */}
        <div className="flex items-center justify-center mb-6">
          <div className="relative w-48 h-48">
            {/* Background circle */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="96"
                cy="96"
                r="80"
                stroke="hsl(var(--muted))"
                strokeWidth="12"
                fill="none"
                opacity="0.2"
              />
              {/* Progress circle */}
              <circle
                cx="96"
                cy="96"
                r="80"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 80}`}
                strokeDashoffset={`${2 * Math.PI * 80 * (1 - percentage / 100)}`}
                className={`${gaugeColor} transition-all duration-1000`}
              />
            </svg>
            
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className={`text-5xl font-bold ${gaugeColor}`}>
                {score.toFixed(1)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">/ 10</div>
            </div>
          </div>
        </div>
        
        {/* Risk level indicator */}
        <div className="text-center">
          <div className={`inline-flex items-center gap-2 ${riskColor} font-bold text-lg`}>
            {isHighRisk && <AlertTriangle className="w-5 h-5 animate-pulse" />}
            {riskLevel}
          </div>
          {rmrStatus && (
            <p className="text-xs text-muted-foreground mt-2">
              Reliability Must Run units designated in this zone
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
