import { chromium } from "@playwright/test";
const browser = await chromium.launch();
async function boot(flags,spawn){
  const p=await browser.newPage({viewport:{width:512,height:448}});
  await p.goto(`http://127.0.0.1:5199/?nointro=1&noEncounters=1&spawn=${spawn}&flags=${encodeURIComponent(flags)}`,{waitUntil:"networkidle"});
  await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:25000});
  await p.waitForTimeout(1000); await p.keyboard.press("x"); await p.waitForTimeout(200);
  return p;
}
const gates=p=>p.evaluate(()=>(globalThis.__bossGates?.gates??[]).map(g=>({id:g.triggerId,armed:g.armed})).filter(g=>g.id.startsWith("raid")||g.id.startsWith("milady")));
const flags=p=>p.evaluate(()=>globalThis.__firstSceneDebug.flags??[]);
const out={};
// A: return to Morningside with act3:complete -> endgame-return fires, raid activates + raid gates arm
let p=await boot("act3:complete","2040,1888");
await p.waitForTimeout(400);
out.A_raidActive=(await flags(p)).includes("raid:morningside:active");
out.A_gates=await gates(p);
await p.close();
// B: raid cleared -> milady-final armed
const raidDone="act3:complete,raid:morningside:active,raid:cell:1,raid:cell:2,raid:cell:3,raid:morningside:cleared,trigger:raid-morningside-1,trigger:raid-morningside-2,trigger:raid-morningside-3,trigger:endgame-return";
p=await boot(raidDone,"1796,1420");
out.B_gates=await gates(p);
await p.close();
// C: milady unmade -> finale fires at plaza -> game:complete
p=await boot(raidDone+",trigger:milady-final,milady:unmade","1796,1360");
const S=()=>p.evaluate(()=>({dlg:globalThis.__firstSceneDebug.dialogueOpen,text:(globalThis.__firstSceneDebug.dialogueText||"").slice(0,50),done:(globalThis.__firstSceneDebug.flags??[]).includes("game:complete")}));
let fired=null;
for(let i=0;i<30;i++){await p.keyboard.down("ArrowUp");await p.waitForTimeout(220);await p.keyboard.up("ArrowUp");await p.waitForTimeout(80);let s=await S();if(s.dlg){for(let k=0;k<9;k++){await p.keyboard.press("z");await p.waitForTimeout(220);}}s=await S();if(s.done){fired={at:i,text:s.text};break;}}
out.C_finale=fired??await S();
await p.close();
console.log(JSON.stringify(out,null,1));
await browser.close();
