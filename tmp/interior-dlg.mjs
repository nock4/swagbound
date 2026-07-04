import { chromium } from "@playwright/test";
const [spawn,approach]=[process.argv[2],process.argv[3]||"u"];
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&spawn=${spawn}`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(1200);
const K={u:"ArrowUp",d:"ArrowDown",l:"ArrowLeft",r:"ArrowRight"};
const st=async(l)=>{const d=await p.evaluate(()=>{const s=globalThis.__firstSceneDebug;return{tgt:s.interactionTargetId,inRange:s.inInteractionRange,dlgOpen:s.dialogueOpen,dlg:(s.dialogueText||'').slice(0,75),pgN:s.dialoguePageCount};});console.log(l,JSON.stringify(d));};
for(let i=0;i<6;i++){await p.keyboard.down(K[approach]);await p.waitForTimeout(120);await p.keyboard.up(K[approach]);await p.waitForTimeout(90);const r=await p.evaluate(()=>globalThis.__firstSceneDebug.inInteractionRange);if(r)break;}
await st("approached");
await p.keyboard.press("KeyZ");await p.waitForTimeout(500);await st("z1");
await p.keyboard.press("KeyZ");await p.waitForTimeout(500);await st("z2");
await b.close();
