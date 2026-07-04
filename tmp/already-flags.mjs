import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
const flags = "sourcecheck:sourcecheck-morningside-001:cleared,cardnft:card-nft-2-10925:owned";
await page.goto(`http://127.0.0.1:5176/?nointro=1&noEncounters=1&spawn=2040,1888&flags=${encodeURIComponent(flags)}`,{waitUntil:"networkidle"});
await page.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:25000}); await page.waitForTimeout(900); await page.mouse.click(256,224);
await page.keyboard.press("x"); await page.waitForTimeout(300);
const pre=await page.evaluate(()=>({owned:globalThis.__binderDebug?.().owned,cleared:(globalThis.__firstSceneDebug?.flags??[]).some(f=>f.includes("morningside-001:cleared"))}));
let ci=false;
for(let i=0;i<8;i++){await page.keyboard.down("ArrowUp");await page.waitForTimeout(140);await page.keyboard.up("ArrowUp");await page.waitForTimeout(150);const s=await page.evaluate(()=>({ci:globalThis.__firstSceneDebug?.canInteract,k:globalThis.__firstSceneDebug?.interactionTargetKind}));if(s.ci&&s.k==="sourceCheck"){ci=true;break;}}
await page.keyboard.press("z"); await page.waitForTimeout(600);
const line=await page.evaluate(()=>({text:globalThis.__firstSceneDebug?.dialogueText??"",launched:Boolean(globalThis.__sourceCheckDebug?.phase)}));
console.log(JSON.stringify({pre,reachedDrifella:ci,onTalk:line},null,1));
await browser.close();
