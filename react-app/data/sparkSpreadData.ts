import { zones } from './lmpData';

export const sparkSpreadData = zones.slice(0, 22).map(z => ({
  zone:   z.id,
  spread: +((Math.random() - 0.5) * 20).toFixed(2),
}));

export function getProfitabilitySignal(avgSpread: number) {
  if (avgSpread > 5)  return { status: 'PROFITABLE', color: 'text-emerald-500', description: 'Gas plants are earning above variable cost.' };
  if (avgSpread > 0)  return { status: 'MARGINAL',   color: 'text-yellow-500',  description: 'Plants near breakeven — monitor closely.' };
  return               { status: 'UNPROFITABLE', color: 'text-red-500',     description: 'Gas plants below variable cost.' };
}
