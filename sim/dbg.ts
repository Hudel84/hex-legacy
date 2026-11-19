import { Battle } from '../src/battle/engine';
import { UNITS } from '../src/data/units';
const a=UNITS.human_t3_swordsman,b=UNITS.undead_t3_ghost;
const bt=new Battle({seed:5,player:{hero:{atk:0,def:0},army:[{def:a,count:14}]},enemy:{hero:{atk:0,def:0},army:[{def:b,count:14}]},obstacles:[]});
let g=0;
while(!bt.winner&&g++<60){bt.nextTurn(); if(bt.winner)break; const s=bt.active!; const act=bt.decide(); const ev=bt.act(act);
 console.log(bt.round,s.def.id,JSON.stringify(act),ev.filter(e=>e.type==='attack').map(e=>JSON.stringify(e)).join(' '), bt.stacks.map(x=>x.count+'/'+x.topHp).join(' '));}
console.log(bt.winner);
