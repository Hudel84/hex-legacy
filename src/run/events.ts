// Text events (act 1). Every option has a requirement check and an effect.
import { run, addLeadership, rng, commitRng, MAX_UNIT_LEVEL, applyBoon, BOONS, upgradeOptions, levelUpUnit, type RunState } from './state';

export interface EventOutcome {
  text: string;                       // i18n key
  vars?: Record<string, string | number>;
  battle?: { group: string; rewardMul: number };
}
export interface EventOption {
  key: string;                        // i18n key of the label
  hint?: string;                      // i18n key of the small text under it
  can?: (r: RunState) => boolean;
  run: (r: RunState) => EventOutcome;
}
export interface GameEvent { id: string; image: string; options: EventOption[]; }

const leave: EventOption = { key: 'event.leave', run: () => ({ text: 'event.left' }) };

export const EVENTS: GameEvent[] = [
  {
    id: 'wounded_soldier', image: 'event_07_wounded_soldier',
    options: [
      { key: 'event.wounded_soldier.help', hint: 'event.wounded_soldier.helpHint', can: (r) => r.gold >= 25,
        run: (r) => { r.gold -= 25; addLeadership(15, r); return { text: 'event.wounded_soldier.helped' }; } },
      { key: 'event.wounded_soldier.rob', hint: 'event.wounded_soldier.robHint',
        run: (r) => { r.gold += 30; r.def = Math.max(0, r.def - 1); return { text: 'event.wounded_soldier.robbed' }; } },
      leave,
    ],
  },
  {
    id: 'wishing_well', image: 'event_13_wishing_well',
    options: [
      { key: 'event.wishing_well.coin', hint: 'event.wishing_well.coinHint', can: (r) => r.gold >= 30,
        run: (r) => {
          r.gold -= 30;
          const g = rng(); const b = g.pick(BOONS.filter((x) => x !== 'gold60')); commitRng(g);
          applyBoon(b, r);
          return { text: 'event.wishing_well.wish', vars: { boon: `boon.${b}` } };
        } },
      leave,
    ],
  },
  {
    id: 'bandit_ambush', image: 'event_10_bandit_ambush',
    options: [
      { key: 'event.bandit_ambush.fight', hint: 'event.bandit_ambush.fightHint',
        run: () => ({ text: 'event.bandit_ambush.fought', battle: { group: 'bandits', rewardMul: 2 } }) },
      { key: 'event.bandit_ambush.pay', hint: 'event.bandit_ambush.payHint', can: (r) => r.gold >= 40,
        run: (r) => { r.gold -= 40; return { text: 'event.bandit_ambush.paid' }; } },
    ],
  },
  {
    id: 'cave_treasure', image: 'event_05_cave_treasure',
    options: [
      { key: 'event.cave_treasure.enter', hint: 'event.cave_treasure.enterHint',
        run: () => ({ text: 'event.cave_treasure.entered', battle: { group: 'wilds', rewardMul: 2.5 } }) },
      leave,
    ],
  },
  {
    id: 'mercenary_camp', image: 'event_35_mercenary_camp',
    options: [
      { key: 'event.mercenary_camp.hire', hint: 'event.mercenary_camp.hireHint', can: (r) => r.gold >= 60,
        run: (r) => { r.gold -= 60; addLeadership(25, r); return { text: 'event.mercenary_camp.hired' }; } },
      { key: 'event.mercenary_camp.train', hint: 'event.mercenary_camp.trainHint', can: (r) => r.gold >= 40,
        run: (r) => { r.gold -= 40; r.atk += 1; return { text: 'event.mercenary_camp.trained' }; } },
      leave,
    ],
  },
  {
    id: 'forest_shrine', image: 'event_02_forest_shrine',
    options: [
      { key: 'event.forest_shrine.pray', hint: 'event.forest_shrine.prayHint',
        run: (r) => { r.def += 1; return { text: 'event.forest_shrine.prayed' }; } },
      { key: 'event.forest_shrine.take', hint: 'event.forest_shrine.takeHint',
        run: (r) => { r.gold += 70; r.leadership = Math.max(40, r.leadership - 10); for (const s of r.army) s.alloc = Math.min(s.alloc, r.leadership); return { text: 'event.forest_shrine.taken' }; } },
    ],
  },
  {
    id: 'knight_tournament', image: 'event_30_knight_tournament',
    options: [
      { key: 'event.knight_tournament.join', hint: 'event.knight_tournament.joinHint', can: (r) => r.gold >= 20,
        run: (r) => {
          r.gold -= 20;
          const g = rng(); const win = g.next() < 0.5 + 0.05 * r.atk; commitRng(g);
          if (win) { r.gold += 90; return { text: 'event.knight_tournament.won' }; }
          return { text: 'event.knight_tournament.lost' };
        } },
      leave,
    ],
  },
  {
    id: 'dormant_forge', image: 'event_57_dormant_forge',
    options: [
      { key: 'event.dormant_forge.work', hint: 'event.dormant_forge.workHint', can: (r) => r.army.some((s) => s.level < MAX_UNIT_LEVEL),
        run: (r) => {
          const g = rng(); const s = g.pick(r.army.filter((x) => x.level < MAX_UNIT_LEVEL));
          const opts = upgradeOptions(s, r);
          levelUpUnit(s, opts.length ? g.pick(opts).id : null);
          commitRng(g);
          return { text: 'event.dormant_forge.worked', vars: { unit: `unit.${s.unitId}` } };
        } },
      leave,
    ],
  },
];

export const EVENT_IDS = EVENTS.map((e) => e.id);
export const eventById = (id: string): GameEvent => EVENTS.find((e) => e.id === id)!;
void run;
