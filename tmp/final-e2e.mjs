import { chromium } from "@playwright/test";
const CONTENT = (await import("../content/drifella-source-checks.json", { with: { type: "json" } })).default;
const ALLQ = CONTENT.checks.flatMap(c => c.questions.pool);
const browser = await chromium.launch();
const R = {};
const scq = (p, wantClear) => driveCheck(p, wantClear);
async function pick(page,t){for(let g=0;g<10;g++){const c=(await page.evaluate(()=>globalThis.__sourceCheckDebug.selection));if(c===t)return;const k=(c<2&&t>=2)?"ArrowDown":(c>=2&&t<2)?"ArrowUp":(c<t?"ArrowRight":"ArrowLeft");await page.keyboard.press(k);await page.waitForTimeout(200);}}
async function driveCheck(page, wantClear){
  await page.mouse.click(256,224);
  for(let s=0;s<26;s++){
    const d=await page.evaluate(()=>globalThis.__sourceCheckDebug??null); if(!d?.phase) return "returned";
    if(d.phase==="question"){const def=ALLQ.find(q=>q.prompt===d.drawnPrompts[d.questionIndex]);const ci=def.type==="trueFalse"?d.options.findIndex(o=>o.trim().toLowerCase()===(def.answer?"true":"false")):d.options.findIndex(o=>o===def.options[def.answerIndex]);await pick(page, wantClear ? ci : (d.questionIndex===0?(ci+1)%d.options.length:ci));}
    await page.keyboard.press("z"); await page.waitForTimeout(340);
  }
  return "stuck";
}

// 1. WORLD: name shows + decline
{ const p=await browser.newPage({viewport:{width:512,height:448}});
  await p.goto("http://127.0.0.1:5176/?nointro=1&noEncounters=1&spawn=2040,1888",{waitUntil:"networkidle"});
  await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:25000}); await p.waitForTimeout(900); await p.mouse.click(256,224);
  await p.keyboard.press("x"); await p.waitForTimeout(400);
  let label=null; for(let i=0;i<8;i++){await p.keyboard.down("ArrowUp");await p.waitForTimeout(140);await p.keyboard.up("ArrowUp");await p.waitForTimeout(150);const s=await p.evaluate(()=>{const sc=(globalThis.__firstSceneDebug?.interactables??[]).find(i=>(i.kind||"").includes("sourceCheck"));return{ci:globalThis.__firstSceneDebug?.canInteract,label:sc?.label};});if(s.ci){label=s.label;break;}if(s.label)label=s.label;}
  await p.keyboard.press("z"); await p.waitForTimeout(500);
  const promptShown=await p.evaluate(()=>globalThis.__firstSceneDebug?.dialogueOpen);
  await p.keyboard.press("x"); await p.waitForTimeout(500);
  const declined=await p.evaluate(()=>!globalThis.__sourceCheckDebug?.phase && !(globalThis.__firstSceneDebug?.flags??[]).some(f=>f.includes("cleared")));
  R.world={label,promptShown,declinedClean:declined}; await p.close(); }

// 2. CLEAR: rewards + persistence
{ const p=await browser.newPage({viewport:{width:512,height:448}});
  await p.goto("http://127.0.0.1:5176/?sourcecheck=sourcecheck-morningside-001",{waitUntil:"networkidle"});
  await p.waitForFunction(()=>globalThis.__sourceCheckDebug!==undefined,{timeout:25000}); await p.waitForTimeout(600);
  await driveCheck(p,true);
  await p.waitForFunction(()=>globalThis.__firstSceneDebug?.player?.x!==undefined,{timeout:15000}).catch(()=>{}); await p.waitForTimeout(800);
  const flags=await p.evaluate(()=>(globalThis.__firstSceneDebug?.flags??[]).filter(f=>/card|source/.test(f)));
  const invHasItem=await p.evaluate(()=>{const inv=globalThis.__firstSceneDebug?.partyState?.inventoryItems??0;return inv;});
  // already-cleared: talk again (spawn onto the drifella)
  await p.goto("http://127.0.0.1:5176/?nointro=1&noEncounters=1&spawn=2040,1888",{waitUntil:"networkidle"});
  await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}); await p.waitForTimeout(700); await p.mouse.click(256,224);
  await p.keyboard.press("x"); await p.waitForTimeout(300);
  for(let i=0;i<8;i++){await p.keyboard.down("ArrowUp");await p.waitForTimeout(140);await p.keyboard.up("ArrowUp");await p.waitForTimeout(150);if(await p.evaluate(()=>globalThis.__firstSceneDebug?.canInteract))break;}
  await p.keyboard.press("z"); await p.waitForTimeout(500);
  const already=await p.evaluate(()=>({text:(globalThis.__firstSceneDebug?.dialogueText??"").slice(0,60),reQuizzed:Boolean(globalThis.__sourceCheckDebug?.phase)}));
  // persistence
  await p.keyboard.press("x"); await p.waitForTimeout(200); await p.keyboard.press("p"); await p.waitForTimeout(800);
  await p.goto("http://127.0.0.1:5176/?nointro=1&noEncounters=1",{waitUntil:"networkidle"});
  await p.waitForFunction(()=>globalThis.__binderDebug!==undefined,{timeout:20000}); await p.waitForTimeout(800);
  const persisted=await p.evaluate(()=>({owned:globalThis.__binderDebug?.().owned,cleared:(globalThis.__firstSceneDebug?.flags??[]).some(f=>f.includes("morningside-001:cleared"))}));
  R.clear={flagsSet:flags,alreadyClearedLine:already.text,reQuizzed:already.reQuizzed,persisted}; await p.close(); }

// 3. FAIL: returns clean, not cleared
{ const p=await browser.newPage({viewport:{width:512,height:448}});
  await p.goto("http://127.0.0.1:5176/?sourcecheck=sourcecheck-morningside-003",{waitUntil:"networkidle"});
  await p.waitForFunction(()=>globalThis.__sourceCheckDebug!==undefined,{timeout:25000}); await p.waitForTimeout(600);
  await driveCheck(p,false);
  await p.waitForFunction(()=>globalThis.__firstSceneDebug?.player?.x!==undefined,{timeout:15000}).catch(()=>{}); await p.waitForTimeout(700);
  R.fail=await p.evaluate(()=>({inWorld:Boolean(globalThis.__firstSceneDebug?.player?.x),cleared:(globalThis.__firstSceneDebug?.flags??[]).some(f=>f.includes("morningside-003:cleared"))})); await p.close(); }

console.log(JSON.stringify(R,null,1));
await browser.close();
