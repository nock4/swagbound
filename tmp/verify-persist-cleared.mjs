import { chromium } from "@playwright/test";
const CONTENT = (await import("../content/drifella-source-checks.json", { with: { type: "json" } })).default;
const ALLQ = CONTENT.checks.flatMap(c => c.questions.pool);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
async function pick(t){for(let g=0;g<10;g++){const c=(await page.evaluate(()=>globalThis.__sourceCheckDebug.selection));if(c===t)return;const k=(c<2&&t>=2)?"ArrowDown":(c>=2&&t<2)?"ArrowUp":(c<t?"ArrowRight":"ArrowLeft");await page.keyboard.press(k);await page.waitForTimeout(200);}}
// 1. clear 001 via debug launcher
await page.goto("http://127.0.0.1:5176/?sourcecheck=sourcecheck-morningside-001",{waitUntil:"networkidle"});
await page.waitForFunction(()=>globalThis.__sourceCheckDebug!==undefined,{timeout:25000}); await page.waitForTimeout(600); await page.mouse.click(256,224);
for(let s=0;s<20;s++){const d=await page.evaluate(()=>globalThis.__sourceCheckDebug??null);if(!d?.phase)break;
  if(d.phase==="question"){const def=ALLQ.find(q=>q.prompt===d.drawnPrompts[d.questionIndex]);const ci=def.type==="trueFalse"?d.options.findIndex(o=>o.trim().toLowerCase()===(def.answer?"true":"false")):d.options.findIndex(o=>o===def.options[def.answerIndex]);await pick(ci);}
  await page.keyboard.press("z");await page.waitForTimeout(340);}
await page.waitForFunction(()=>globalThis.__firstSceneDebug?.player?.x!==undefined,{timeout:15000}).catch(()=>{}); await page.waitForTimeout(800);
const afterClear=await page.evaluate(()=>({owned:globalThis.__binderDebug?.().owned,cleared:(globalThis.__firstSceneDebug?.flags??[]).some(f=>f.includes("morningside-001:cleared"))}));
// 2. SAVE (P) while still in this cleared session
await page.mouse.click(120,120); await page.keyboard.press("p"); await page.waitForTimeout(900);
// 3. reload the SAME game (nointro loads the save)
await page.goto("http://127.0.0.1:5176/?nointro=1&noEncounters=1",{waitUntil:"networkidle"});
await page.waitForFunction(()=>globalThis.__binderDebug!==undefined,{timeout:20000}); await page.waitForTimeout(900);
const afterReload=await page.evaluate(()=>({owned:globalThis.__binderDebug?.().owned,cleared:(globalThis.__firstSceneDebug?.flags??[]).some(f=>f.includes("morningside-001:cleared"))}));
// 4. walk to the (now cleared) Drifella 168 and talk -> should show alreadyCleared, not entry
await page.evaluate(()=>{ // teleport via debug spawn param not available post-load; walk from current spawn is far. Instead reload with spawn onto it.
});
await page.goto("http://127.0.0.1:5176/?noEncounters=1&spawn=2040,1888",{waitUntil:"networkidle"}); // loads save (no fresh=), positions near 168
await page.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}); await page.waitForTimeout(900); await page.mouse.click(256,224);
const stillCleared=await page.evaluate(()=>({owned:globalThis.__binderDebug?.().owned,cleared:(globalThis.__firstSceneDebug?.flags??[]).some(f=>f.includes("morningside-001:cleared"))}));
for(let i=0;i<8;i++){await page.keyboard.down("ArrowUp");await page.waitForTimeout(140);await page.keyboard.up("ArrowUp");await page.waitForTimeout(150);if(await page.evaluate(()=>globalThis.__firstSceneDebug?.canInteract))break;}
await page.keyboard.press("z"); await page.waitForTimeout(600);
const talk=await page.evaluate(()=>({text:(globalThis.__firstSceneDebug?.dialogueText??"").slice(0,70),launchedCheck:Boolean(globalThis.__sourceCheckDebug?.phase)}));
console.log(JSON.stringify({afterClear,afterReload,stillClearedAtDrifella:stillCleared,talkAfterCleared:talk},null,1));
await browser.close();
