import { chromium } from "@playwright/test";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&spawn=3712,320`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(700);
const oe=async()=>p.evaluate(()=>({e:globalThis.__overworldEnemies?.enemies||[],px:globalThis.__firstSceneDebug?.player?.x,py:globalThis.__firstSceneDebug?.player?.y}));
// walk to spawn an enemy, then STOP a step away (~50px) so it's within flee-detect
const dirs=["ArrowRight","ArrowDown","ArrowLeft","ArrowUp"];
let ready=false;
for(let i=0;i<20 && !ready;i++){const k=dirs[i%4];await p.keyboard.down(k);await p.waitForTimeout(300);await p.keyboard.up(k);const s=await oe();if(s.e.length){ready=true;}}
if(!ready){console.log("no spawn");await b.close();process.exit(0);}
// flip flees ON; then sample distance — flee => distance INCREASES (enemy runs away)
const n=await p.evaluate(()=>globalThis.__debugSetRoamerFlees(true));
console.log("set flees on",n,"roamers");
let trend=[]; let facings=[];
for(let i=0;i<10;i++){await p.waitForTimeout(400);const s=await oe();if(s.e.length){const e=s.e[0];trend.push(Math.round(Math.hypot(e.x-s.px,e.y-s.py)));facings.push(e.facing);}}
console.log("post-flee distance trend (increasing = fleeing away):", trend.join(" -> "));
console.log("flees flag now:", await p.evaluate(()=>globalThis.__overworldEnemies?.enemies?.[0]?.flees));
await b.close();
