import {describe,it,expect} from 'vitest';
import {defaults,brush,kernel,plan,at,consumed,simulate,lamps,massBalance,parseNumber,colorFraction} from '../src/apps/bls-bahnplanung/model';
describe('BLS physics and motion',()=>{
it('normalizes the Gaussian on an unlimited plane',()=>{let sum=0;for(let x=-500;x<500;x+=2)for(let y=-300;y<300;y+=2)sum+=kernel(x,y,defaults)*4;expect(sum).toBeCloseTo(1,5);});
it('round spray and discrete cap rotation',()=>{const p={...defaults,horn:0};expect(brush(p).sx).toBe(brush(p).sy);expect(kernel(20,5,{...defaults,orientation:0})).toBeCloseTo(kernel(5,20,{...defaults,orientation:90}),10);});
it('distance doubles width without creating volume',()=>{expect(brush({...defaults,distance:300}).sx/brush({...defaults,distance:150}).sx).toBe(2);});
it('stops X during nozzle offset while spraying',()=>{const s=plan({...defaults,spacing:50}),g=s.find(g=>g.b.phase==='Düsenversatz')!;expect(g.a.x).toBe(g.b.x);expect(g.b.on).toBe(true);expect(g.duration).toBeCloseTo(1.5);expect(at(s,g.start+g.duration/2).y).toBeCloseTo((g.a.y+g.b.y)/2);});
it('sprays while rotating 90 degrees',()=>{const s=plan({...defaults,mode:'cross',passes:2}),g=s.find(g=>g.b.phase==='Werkstück drehen')!;expect(g.b.on).toBe(true);expect(g.b.angle-g.a.angle).toBeCloseTo(Math.PI/2);});
it('counts priming consumption',()=>{expect(consumed(plan(defaults),2.5,80)).toBeCloseTo(80/60);});
it('zero flow gives zero coating',()=>{const r=simulate({...defaults,q:0});expect(Math.max(...r.frames.at(-1)!.z)).toBe(0);expect(r.frames.at(-1)!.used).toBe(0);});
it('stationary deposition matches analytical center and volume',()=>{const p={...defaults,mode:'spot',spot:2};const r=simulate(p),f=r.frames.at(-1)!;const center=f.z[Math.floor(r.ny/2)*r.nx+Math.floor(r.nx/2)];expect(center).toBeCloseTo(p.q/60*2*1e6*.7*kernel(0,0,p),1);const volume=f.z.reduce((a,b)=>a+b,0)*r.dx*r.dy/1e6;expect(volume).toBeLessThan(f.used);expect(f.used).toBeCloseTo(4);});
it('short overtravel increases edge deposition',()=>{const p={...defaults,spacing:50};const short=simulate({...p,over:0}),long=simulate({...p,over:100});const edge=(r:ReturnType<typeof simulate>)=>{const z=r.frames.at(-1)!.z;return z.reduce((sum,v,i)=>sum+(i%r.nx<3||i%r.nx>r.nx-4?v:0),0);};expect(edge(short)).toBeGreaterThan(edge(long));});
it('caps total withdrawal at syringe capacity',()=>{const r=simulate({...defaults,mode:'spot',q:420,spot:30});expect(r.frames.at(-1)!.used).toBe(100);});
});

describe('BLS revised controls and material accounting',()=>{
 it('validates completed text, accepts comma and rejects empty or out-of-range values',()=>{expect(parseNumber('100',0,300)).toBe(100);expect(parseNumber('1,2',.5,3)).toBe(1.2);expect(parseNumber('',0,300)).toBeNull();expect(parseNumber('400',0,300)).toBeNull();});
 it('color scale spreads small values without changing endpoints',()=>{expect(colorFraction(0,100,true)).toBe(0);expect(colorFraction(100,100,true)).toBe(1);expect(colorFraction(1,100,true)).toBeGreaterThan(colorFraction(1,100,false));});
 it('AWG uses deposition including priming losses and is independent of wet density',()=>{const p={...defaults,mode:'spot'},r=simulate(p),f=r.frames.at(-1)!;const a=massBalance(p,r,f),b=massBalance({...p,density:2.5},r,f);expect(a.awg).toBeCloseTo(b.awg!);expect(a.awg).toBeGreaterThan(0);expect(a.awg).toBeLessThan(35);expect(b.sprayedWetMass).toBeCloseTo(f.used*2.5);expect(massBalance({...p,solids:0},r,f).awg).toBeNull();});
 it('indicates blink, advance, deposition, retraction and completion',()=>{const s=plan(defaults),duration=s.at(-1)!.start+s.at(-1)!.duration;const lights=(t:number)=>lamps(at(s,t),t,duration);expect(lights(0).every(l=>l.state==='off')).toBe(true);expect(lights(.3)[0].state).toBe('on');expect(lights(.3)[1].state).toBe('blink');expect(lights(1)[3].state).toBe('on');expect(lights(2)[3].state).toBe('on');expect(lights(duration-.5)[2].state).toBe('on');expect(lights(duration-.5)[0].state).toBe('on');expect(lights(duration).every(l=>l.state==='off')).toBe(true);});
 it('adds a non-spraying final retract phase without withdrawing more coating',()=>{const s=plan(defaults),g=s.at(-1)!;expect(g.b.phase).toBe('Spritze entnehmen');expect(g.b.on).toBe(false);expect(consumed(s,g.start,80)).toBeCloseTo(consumed(s,g.start+g.duration,80));});
});

 describe('BLS machine frame and signed edge offsets',()=>{
 it('applies unchanged X offset after quarter turn',()=>{const p={...defaults,mode:'cross',passes:2,over:17};const s=plan(p).filter(g=>g.b.phase==='Beschichtungsbahn');for(const g of s)expect(Math.abs(g.b.x)).toBeCloseTo((g.b.angle?p.height:p.width)/2+17);});
 it('uses delta Y to increase symmetric row count without changing spacing',()=>{const a=plan({...defaults,deltaY:0}).filter(g=>g.b.phase==='Beschichtungsbahn');const b=plan({...defaults,deltaY:45}).filter(g=>g.b.phase==='Beschichtungsbahn');expect(b.length).toBeGreaterThan(a.length);expect(b[1].b.y-b[0].b.y).toBeCloseTo(defaults.spacing);expect(b[0].b.y).toBeCloseTo(-b.at(-1)!.b.y);});
 it('supports shorter travel with negative X offset',()=>{const p={...defaults,over:-20};expect(Math.abs(plan(p).find(g=>g.b.phase==='Beschichtungsbahn')!.b.x)).toBe(80);});
 it('plans 250 mm square workpieces through both orientations',()=>{const s=plan({...defaults,width:250,height:250,mode:'cross',passes:2});expect(s.every(g=>Number.isFinite(g.duration)&&g.duration>0)).toBe(true);expect(s.some(g=>g.b.angle===Math.PI/2)).toBe(true);});
 });
