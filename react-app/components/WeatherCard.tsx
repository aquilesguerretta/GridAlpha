import { Card } from '@/react-app/components/ui/card';
import { Cloud, Sun, CloudSnow } from 'lucide-react';

interface WeatherCardProps {
  temperature: number;
  condition: 'sunny' | 'cloudy' | 'snowy' | string;
  alert: string | null;
}

export default function WeatherCard({ temperature, condition, alert }: WeatherCardProps) {
  const getWeatherIcon = () => {
    switch (condition) {
      case 'sunny':
        return <Sun className="w-12 h-12 text-yellow-400" />;
      case 'cloudy':
        return <Cloud className="w-12 h-12 text-gray-400" />;
      case 'snowy':
        return <CloudSnow className="w-12 h-12 text-blue-300" />;
      default:
        return <Cloud className="w-12 h-12 text-gray-400" />;
    }
  };

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Weather</p>
          <p className="text-3xl font-bold">{temperature}°F</p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">{condition}</p>
          <p className="text-xs text-muted-foreground">{alert}</p>
        </div>
        <div className="ml-4">
          {getWeatherIcon()}
        </div>
      </div>
    </Card>
  );
}
