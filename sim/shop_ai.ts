// The AI at the shop (v0.19): artifact if affordable, else a piece of equipment; sometimes hires a neutral creature.
import { run, owner, grantPerk, stashItem, bagFull, rebalance, MAX_SLOTS, count } from '../src/run/state';
import { offer } from '../src/run/perks';
import { rollItem, ITEM_PRICE, ITEMS } from '../src/run/items';
import { shopNeutrals, neutralPrice } from '../src/run/encounters';
import { UNITS } from '../src/data/units';
import type { Rng } from '../src/run/rng';

export function aiShop(pick: Rng, floor: number): void {
  const r = run();
  const art = offer('artifact', 1, owner(), pick)[0];
  if (art) {
    const cost = art.rarity === 'legendary' ? 330 : art.rarity === 'rare' ? 225 : 165;
    if (r.gold >= cost) { r.gold -= cost; grantPerk(art.id); }
  }
  // a neutral creature: only if it is stronger (tier) than the weakest own unit type, or a slot is free
  const ns = shopNeutrals(pick, floor);
  if (ns.length && pick.next() < 0.5) {
    const id = ns[0];
    const cost = neutralPrice(id);
    const weakest = [...r.army].sort((a, b) => UNITS[a.unitId].tier + a.level * 0.5 - UNITS[b.unitId].tier - b.level * 0.5)[0];
    const better = !weakest || UNITS[id].tier > UNITS[weakest.unitId].tier + weakest.level * 0.5;
    if (r.gold >= cost && (r.army.length < MAX_SLOTS || better)) {
      r.gold -= cost;
      const unit = { unitId: id, alloc: 0, level: 0, ups: [] };
      if (r.army.length < MAX_SLOTS) r.army.push(unit); else r.army[r.army.indexOf(weakest)] = unit;
      rebalance();
    }
  }
  for (let k = 0; k < 2 && !bagFull(); k++) {
    const it = rollItem(pick, floor, k === 1 ? 'rare' : undefined);
    const cost = ITEM_PRICE[ITEMS[it.id].rarity];
    if (r.gold < cost) break;
    r.gold -= cost; stashItem(it);
  }
  void count;
}
