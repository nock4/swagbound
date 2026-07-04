import { chromium } from "@playwright/test";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&battle=104`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__battleDebug!==undefined,{timeout:20000}).catch(()=>{});
// wait through the enter-transition into command-input, then sample the beat counter over ~3.3s
await p.waitForTimeout(1800);
const t0=await p.evaluate(()=>({beats:globalThis.__dangerBeats||0,phase:globalThis.__battleDebug?.phase}));
await p.waitForTimeout(3300);
const t1=await p.evaluate(()=>({beats:globalThis.__dangerBeats||0,phase:globalThis.__battleDebug?.phase}));
console.log("t0:",JSON.stringify(t0));
console.log("t1 (after ~3.3s):",JSON.stringify(t1));
console.log("beats added in 3.3s (expect ~4 at 820ms interval):", t1.beats - t0.beats);
await b.close();
