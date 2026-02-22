import { zones } from './lmpData';

export interface ResourceGapData {
  zone: string;
  reliability_score: number;
  rmr_status: boolean;
  current_capacity: number;
  scheduled_retirements: number;
  new_projects: number;
  load_forecast: number;
  net_position: number;
  investment_signal: string;
}

export const resourceGapDataByZone: Record<string, ResourceGapData> = Object.fromEntries(
  zones.map(z => {
    const score = Math.floor(Math.random() * 10) + 1;
    const capacity = 1000 + Math.random() * 2000;
    const retirements = -(Math.random() * 500);
    const newProjects = Math.random() * 800;
    const forecast = capacity * 0.85;
    return [z.id, {
      zone:                  z.id,
      reliability_score:     score,
      rmr_status:            score > 7,
      current_capacity:      +capacity.toFixed(0),
      scheduled_retirements: +retirements.toFixed(0),
      new_projects:          +newProjects.toFixed(0),
      load_forecast:         +forecast.toFixed(0),
      net_position:          +(capacity + retirements + newProjects - forecast).toFixed(0),
      investment_signal:     score > 7
        ? `HIGH — ${z.id} faces significant capacity shortfall. Storage and peakers offer strong returns.`
        : `MODERATE — ${z.id} has manageable retirement risk with adequate queue projects.`,
    }];
  })
);
