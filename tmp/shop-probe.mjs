import { chromium } from "@playwright/test";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&spawn=4488,5488`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(1000);
const st=async(l)=>{const d=await p.evaluate(()=>{const s=globalThis.__firstSceneDebug;const m=(s.menuRenderStack||[]);const buy=m.find(x=>x.title==='Buy');return{tgt:s.interactionTargetId,inRange:s.inInteractionRange,shopOpen:s.shopOpen,buyItems:buy?buy.items.map(i=>i.label):null,dlg:(s.dialogueText||'').slice(0,45)};});console.log(l,JSON.stringify(d));};
// nudge up to be adjacent-below the clerk (4488,5440)
await p.keyboard.down("ArrowUp");await p.waitForTimeout(180);await p.keyboard.up("ArrowUp");await p.waitForTimeout(200);
await st("approached");
for(let i=0;i<7;i++){await p.keyboard.press("KeyZ");await p.waitForTimeout(500);}
await st("after-Z");
await p.screenshot({path:"tmp/postwick-bakery-shop.png"});
await b.close();
