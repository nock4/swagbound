import { chromium } from "@playwright/test";
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
await p.goto(`http://127.0.0.1:5173/?nointro=1&spawn=3712,320`,{waitUntil:"networkidle"});
await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{});
await p.waitForTimeout(700);
const dirs=["ArrowRight","ArrowDown","ArrowLeft","ArrowUp"];
let spawned=false;
for(let i=0;i<20 && !spawned;i++){const k=dirs[i%4];await p.keyboard.down(k);await p.waitForTimeout(300);await p.keyboard.up(k);spawned=await p.evaluate(()=>(globalThis.__overworldEnemies?.count||0)>0);}
if(!spawned){console.log("no spawn");await b.close();process.exit(0);}
const ok=await p.evaluate(()=>globalThis.__debugInstantWin());
console.log("instantWin fired:", ok);
await p.waitForTimeout(400);
// read the dialogue tally, page through it
const pages=[];
for(let i=0;i<6;i++){const d=await p.evaluate(()=>{const s=globalThis.__firstSceneDebug;return{open:s.dialogueOpen,text:s.dialogueText};});if(d.open&&d.text)pages.push(d.text.replace(/\n/g,' | '));await p.keyboard.press("KeyZ");await p.waitForTimeout(350);}
console.log("tally pages:");
[...new Set(pages)].forEach(t=>console.log("  •",t.slice(0,80)));
await b.close();
