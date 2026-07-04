import { chromium } from "@playwright/test";
const CONTENT = (await import("../content/drifella-source-checks.json", { with: { type: "json" } })).default;
const ALLQ = CONTENT.checks.flatMap(c => c.questions.pool);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
async function pick(t){for(let g=0;g<10;g++){const c=(await page.evaluate(()=>globalThis.__sourceCheckDebug.selection));if(c===t)return;const k=(c<2&&t>=2)?"ArrowDown":(c>=2&&t<2)?"ArrowUp":(c<t?"ArrowRight":"ArrowLeft");await page.keyboard.press(k);await page.waitForTimeout(200);}}
// clear 001, save, reload spawning RIGHT below it, talk
await page.goto("http://127.0.0.1:5176/?sourcecheck=sourcecheck-morningside-001",{waitUntil:"networkidle"});
await page.waitForFunction(()=>globalThis.__sourceCheckDebug!==undefined,{timeout:25000}); await page.waitForTimeout(600); await page.mouse.click(256,224);
for(let s=0;s<20;s++){const d=await page.evaluate(()=>globalThis.__sourceCheckDebug??null);if(!d?.phase)break;if(d.phase==="question"){const def=ALLQ.find(q=>q.prompt===d.drawnPrompts[d.questionIndex]);const ci=def.type==="trueFalse"?d.options.findIndex(o=>o.trim().toLowerCase()===(def.answer?"true":"false")):d.options.findIndex(o=>o===def.options[def.answerIndex]);await pick(ci);}await page.keyboard.press("z");await page.waitForTimeout(340);}
await page.waitForFunction(()=>globalThis.__firstSceneDebug?.player?.x!==undefined,{timeout:15000}).catch(()=>{}); await page.waitForTimeout(700);
await page.mouse.click(120,120); await page.keyboard.press("p"); await page.waitForTimeout(900);
// reload loading the save, spawn 24px south of the drifella (2040,1840 faces up)
await page.goto("http://127.0.0.1:5176/?noEncounters=1&spawn=2040,1864",{waitUntil:"networkidle"});
await page.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}); await page.waitForTimeout(900); await page.mouse.click(256,224);
// nudge up until canInteract with the sourceCheck
let ready=false;
for(let i=0;i<6;i++){const s=await page.evaluate(()=>({ci:globalThis.__firstSceneDebug?.canInteract,k:globalThis.__firstSceneDebug?.interactionTargetKind}));if(s.ci&&s.k==="sourceCheck"){ready=true;break;}await page.keyboard.down("ArrowUp");await page.waitForTimeout(120);await page.keyboard.up("ArrowUp");await page.waitForTimeout(140);}
const pre=await page.evaluate(()=>({ci:globalThis.__firstSceneDebug?.canInteract,k:globalThis.__firstSceneDebug?.interactionTargetKind}));
await page.keyboard.press("z"); await page.waitForTimeout(600);
const line=await page.evaluate(()=>({text:globalThis.__firstSceneDebug?.dialogueText??"",launched:Boolean(globalThis.__sourceCheckDebug?.phase)}));
console.log(JSON.stringify({ready,pre,alreadyClearedLine:line},null,1));
await browser.close();
