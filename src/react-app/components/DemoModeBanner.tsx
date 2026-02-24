import { AlertTriangle } from 'lucide-react';

export default function DemoModeBanner() {
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-2">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertTriangle className="w-4 h-4" />
          <p className="text-sm font-medium">
            Demo Mode — Displaying sample dataset. Connect to live API for real-time data.
          </p>
        </div>
      </div>
    </div>
  );
}
