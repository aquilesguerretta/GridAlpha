export const zones = [
  { id: 'WEST HUB',  name: 'Western Hub' },
  { id: 'EAST HUB',  name: 'Eastern Hub' },
  { id: 'AEP',       name: 'AEP Zone' },
  { id: 'APS',       name: 'APS Zone' },
  { id: 'AECO',      name: 'AECO Zone' },
  { id: 'BGE',       name: 'BGE Zone' },
  { id: 'COMED',     name: 'ComEd Zone' },
  { id: 'DAY',       name: 'Dayton Zone' },
  { id: 'DEOK',      name: 'DEOK Zone' },
  { id: 'DOM',       name: 'Dominion Zone' },
  { id: 'DPL',       name: 'DPL Zone' },
  { id: 'DUQ',       name: 'Duquesne Zone' },
  { id: 'EKPC',      name: 'EKPC Zone' },
  { id: 'JCPL',      name: 'JCPL Zone' },
  { id: 'METED',     name: 'Met-Ed Zone' },
  { id: 'PECO',      name: 'PECO Zone' },
  { id: 'PEPCO',     name: 'Pepco Zone' },
  { id: 'PPL',       name: 'PPL Zone' },
  { id: 'PSEG',      name: 'PSE&G Zone' },
  { id: 'RECO',      name: 'RECO Zone' },
  { id: 'ATSI',      name: 'ATSI Zone' },
  { id: 'OVEC',      name: 'OVEC Zone' },
  { id: 'PENELEC',   name: 'Penelec Zone' },
  { id: 'PJM-RTO',   name: 'PJM-RTO' },
];

function genHours(base: number, spread: number) {
  return Array.from({ length: 24 }, (_, i) => ({
    timestamp: `2026-02-22T${String(i).padStart(2, '0')}:00:00`,
    energy:     +(base + (Math.random() - 0.5) * spread * 0.7).toFixed(2),
    congestion: +(((Math.random() - 0.5) * spread * 0.2)).toFixed(2),
    loss:       +(spread * 0.05 * Math.random()).toFixed(2),
    total:      0,
  })).map(h => ({ ...h, total: +(h.energy + h.congestion + h.loss).toFixed(2) }));
}

export const lmpDataByZone: Record<string, ReturnType<typeof genHours>> = Object.fromEntries(
  zones.map(z => [z.id, genHours(30 + Math.random() * 10, 8)])
);
