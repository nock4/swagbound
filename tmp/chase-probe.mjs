import { chromium } from "@playwright/test";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&spawn=3712,240`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(900);
const oe=async()=>p.evaluate(()=>({c:globalThis.__overworldEnemies?.count||0, e:globalThis.__overworldEnemies?.enemies||[], px:globalThis.__firstSceneDebug?.player?.x, py:globalThis.__firstSceneDebug?.player?.y, battle:!!globalThis.__battleDebug&&['enter-transition','command-input','execution'].includes(globalThis.__battleDebug.phase)}));
// walk a loop until an enemy spawns (max ~14s)
const dirs=["ArrowRight","ArrowDown","ArrowLeft","ArrowUp"]; let spawned=false;
for(let i=0;i<28 && !spawned;i++){const k=dirs[i%4];await p.keyboard.down(k);await p.waitForTimeout(320);await p.keyboard.up(k);const s=await oe();if(s.c>0){spawned=true;console.log("spawned after",i,"bursts; enemy:",JSON.stringify(s.e[0]));}}
if(!spawned){console.log("NO SPAWN after continuous walk"); await b.close(); process.exit(0);}
// now stop; sample the enemy's distance to the (stationary) player
let trend=[]; let battled=false; let sawMoving=false; let facings=new Set();
for(let i=0;i<16;i++){await p.waitForTimeout(450);const s=await oe();if(s.battle){battled=true;break;}if(s.e.length){const e=s.e[0];trend.push(Math.round(Math.hypot(e.x-s.px,e.y-s.py)));if(e.moving)sawMoving=true;facings.add(e.facing);}}
console.log("stationary-player distance trend:", trend.join(" -> "));
console.log("enemy moved while player still:", sawMoving, "| facings seen:", [...facings].join(","));
console.log("battle started (homed to contact):", battled);
await b.close();
