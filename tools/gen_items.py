# Generates src/run/itemData.ts (and tools/item_names.json for the EN/DE names) from tools/items_spec.txt.
# Spec columns: icon id | rarity c/u/r/e/l | stats (a=ATK d=DEF p=power k=knowledge l=leadership) | battle mods | people | EN name | DE name
# Run from the repo root: python3 tools/gen_items.py
import json, collections, re
R={'c':'common','u':'uncommon','r':'rare','e':'epic','l':'legendary'}
SK={'a':'atk','d':'def','p':'power','k':'knowledge','l':'lead'}
rows=[]
EN={}; DE={}
for line in open('tools/items_spec.txt',encoding='utf-8'):
    icon,rar,stats,mods,fac,en,de=line.rstrip('\n').split('|')
    slot=icon.split('_')[0]
    st={}
    for tok in stats.split():
        v=int(tok[1:]); key=SK[tok[0]]
        # balancing 20.11.: item stats at 60 % of the design table (leadership in steps of 5)
        st[key]= max(5, int(round(v*0.6/5))*5) if key=='lead' else max(1, int(round(v*0.6+0.001)))
    md={}
    for tok in mods.split():
        m=re.match(r'(round1Ini|[a-zA-Z]+)([-\d.]+)',tok); k,v=m.group(1),m.group(2)
        md[k]=float(v) if '.' in v else int(v)
    rows.append((icon,slot,R[rar],st,md,fac))
    EN[f'item.{icon}']=en; DE[f'item.{icon}']=de
def js(d): return '{ '+', '.join(f'{k}: {v}' for k,v in d.items())+' }' if d else '{}'
out=["// Generated from the item table (scripts/items_spec.txt): id = icon name, slot, rarity, stats, battle mods, people.",
"import type { ItemDef } from './items';","","export const ITEM_DATA: ItemDef[] = ["]
for icon,slot,rar,st,md,fac in rows:
    extra=f", mods: {js(md)}" if md else ''
    extra+=f", faction: '{fac}'" if fac else ''
    out.append(f"  {{ id: '{icon}', slot: '{slot}', rarity: '{rar}', stats: {js(st)}{extra} }},")
out.append("];\n")
open('src/run/itemData.ts','w').write('\n'.join(out))
json.dump({'en':EN,'de':DE},open('tools/item_names.json','w'),ensure_ascii=False)
print(len(rows))
