# Adds the units of a table (see tools/units_act23.txt) to src/data/units.json and their names to the i18n files.
# Usage: python3 tools/add_units.py tools/units_act23.txt
import json, sys, collections
table = sys.argv[1]
U = json.load(open('src/data/units.json'), object_pairs_hook=collections.OrderedDict)
names = {'en': {}, 'de': {}}
ENGINE_FLAGS = {'flying', 'wide', 'mounted', 'undead', 'still'}
for line in open(table, encoding='utf-8'):
    if not line.strip() or line.startswith('#'): continue
    uid, tier, hp, atk, df, dmg, ini, spd, cost, flags, en, de = [x.strip() for x in line.rstrip('\n').split('|')]
    lo, hi = map(int, dmg.split('-'))
    d = collections.OrderedDict(faction=uid.split('_')[0] if uid.split('_')[0] in ('human','elf','dwarf','undead','orc','demon') else 'neutral',
        tier=int(tier), hp=int(hp), atk=int(atk), **{'def': int(df)}, dmg=[lo, hi], ini=int(ini), speed=int(spd), cost=int(cost))
    passives = []
    active = None
    for f in flags.split():
        if f.startswith('ranged='): d['ranged'] = int(f[7:])
        elif f.startswith('size='): d['sizeScale'] = float(f[5:])
        elif f.startswith('active='): active = f[7:]
        elif f == 'still': d['still'] = True
        elif f in ENGINE_FLAGS: d[f] = True
        else: passives.append(f)
    if passives: d['passives'] = passives
    if active: d['active'] = active
    kind = 'neutrals' if uid.startswith('neutral_') else 'bosses' if uid.split('_')[0] in ('boss', 'elite', 'summon') else 'units'
    d['sheet'] = f'{kind}/animated/anim_{uid}_idle_sheet_8x4.webp'
    d['portrait'] = f'ui/portraits/{kind}/portrait_{uid}.webp'
    if d.get('still') is True: d['still'] = f'{kind}/{uid}.webp'
    U[uid] = d
    names['en'][f'unit.{uid}'] = en; names['de'][f'unit.{uid}'] = de
json.dump(U, open('src/data/units.json', 'w'), ensure_ascii=False, indent=2); open('src/data/units.json', 'a').write('\n')
for lang in ('en', 'de'):
    p = f'src/i18n/{lang}.json'
    t = json.load(open(p), object_pairs_hook=collections.OrderedDict); t.update(names[lang])
    json.dump(t, open(p, 'w'), ensure_ascii=False, indent=2); open(p, 'a').write('\n')
print(len(names['en']), 'units')
