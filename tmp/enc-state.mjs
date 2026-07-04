import { chromium } from "@playwright/test";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&spawn=1920,240`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(900);
for(const k of ["ArrowDown","ArrowUp","ArrowLeft"]){await p.keyboard.down(k);await p.waitForTimeout(300);await p.keyboard.up(k);await p.waitForTimeout(150);}
const d=await p.evaluate(()=>{const s=globalThis.__firstSceneDebug;return{sector:s.currentSectorIndex,encounterEnabled:s.encounterEnabled,encounterCooldownMs:s.encounterCooldownMs,lastEncounterGroup:s.lastEncounterGroup,oeCount:globalThis.__overworldEnemies?.count};});
console.log("enc-state", JSON.stringify(d));
await b.close();
