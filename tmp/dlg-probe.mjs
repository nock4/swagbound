import { chromium } from "@playwright/test";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&spawn=5840,8392`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(1200);
const st=async(l)=>{const d=await p.evaluate(()=>{const s=globalThis.__firstSceneDebug;return{p:[Math.round(s.player.x),Math.round(s.player.y)],inRange:s.inInteractionRange,tgt:s.interactionTargetId,dlgOpen:s.dialogueOpen,dlg:(s.dialogueText||'').slice(0,72),pgN:s.dialoguePageCount};});console.log(l,JSON.stringify(d));};
await st("start");
for(let i=0;i<5;i++){await p.keyboard.down("ArrowUp");await p.waitForTimeout(120);await p.keyboard.up("ArrowUp");await p.waitForTimeout(90);const r=await p.evaluate(()=>globalThis.__firstSceneDebug.inInteractionRange);if(r)break;}
await st("approached");
await p.keyboard.press("KeyZ");await p.waitForTimeout(500);await st("z1");
await p.keyboard.press("KeyZ");await p.waitForTimeout(500);await st("z2");
await p.screenshot({path:"tmp/actg-exhibit-dialogue.png"});
await b.close();
