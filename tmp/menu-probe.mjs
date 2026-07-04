import { chromium } from "@playwright/test";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&spawn=2112,1768`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(900);
const menu=async()=>p.evaluate(()=>{const m=globalThis.__firstSceneDebug?.menu;return{open:m?.open,stack:m?.stack,items:m?.items?.map(i=>i.label)||m?.screen?.items?.map(i=>i.label)};});
await p.keyboard.press("KeyX");await p.waitForTimeout(400);
console.log("main menu:", JSON.stringify(await menu()));
// navigate down to Status (index 5) and open it
for(let i=0;i<5;i++){await p.keyboard.press("ArrowDown");await p.waitForTimeout(120);}
await p.keyboard.press("KeyZ");await p.waitForTimeout(400);
console.log("status screen:", JSON.stringify(await menu()));
await b.close();
