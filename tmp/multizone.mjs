import { chromium } from "@playwright/test";
const zones=[["Morningside",2216,240],["Postwick",3064,3704],["SaturnValley",752,7688],["Solana",6024,2728],["ActG",5968,8440]];
const b=await chromium.launch();
for(const [name,x,y] of zones){
  const p=await b.newPage({viewport:{width:512,height:448},deviceScaleFactor:3});
  await p.goto(`http://127.0.0.1:5173/?nointro=1&spawn=${x},${y}`,{waitUntil:"networkidle"});
  await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{});
  await p.waitForTimeout(1500);
  // movement check: try to move
  const before=await p.evaluate(()=>[globalThis.__firstSceneDebug.player.x,globalThis.__firstSceneDebug.player.y]);
  await p.keyboard.down("ArrowDown");await p.waitForTimeout(300);await p.keyboard.up("ArrowDown");
  await p.keyboard.down("ArrowLeft");await p.waitForTimeout(300);await p.keyboard.up("ArrowLeft");await p.waitForTimeout(150);
  const r=await p.evaluate(()=>{const s=globalThis.__firstSceneDebug;const added=(s.npcs||[]).filter(n=>n.id>=101000);return{after:[Math.round(s.player.x),Math.round(s.player.y)],addedActive:added.length,skinned:added.filter(n=>n.visible).length};});
  const moved=Math.abs(r.after[0]-before[0])+Math.abs(r.after[1]-before[1]);
  console.log(`${name}: addedActive=${r.addedActive} moved=${moved>2?'YES('+moved+'px)':'NO'}`);
  await p.close();
}
await b.close();
