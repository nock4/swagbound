import { chromium } from "@playwright/test";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&battle=104`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__battleDebug!==undefined,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(3500);
const st=await p.evaluate(()=>({beats:globalThis.__dangerBeats,phase:globalThis.__battleDebug?.phase,partyHp:(globalThis.__battleDebug?.party||[]).map(m=>m.hp?.displayed??m.hp)}));
console.log("full-HP battle:", JSON.stringify(st), "-> beats should be undefined (no false fire)");
await b.close();
