import { chromium } from "@playwright/test";
const BASE = process.env.BASE;
const INIT = `
window.__au = [];
const log = (e) => window.__au.push(Object.assign({ t: +performance.now().toFixed(1) }, e));
window.__mark = (m)=>log({k:'MARK', m});
try {
let cid = 0;
function patch(AC){
  if(!AC || AC.__patched) return; AC.__patched = true;
  const oBuf = AC.prototype.createBufferSource;
  AC.prototype.createBufferSource = function(){
    const ctx = this; if(ctx.__id==null) ctx.__id = ++cid;
    const n = oBuf.call(this);
    const os = n.start.bind(n), ost = n.stop.bind(n);
    n.start = function(w){ try{ log({k:'src', ctx:ctx.__id, dur:+(n.buffer&&n.buffer.duration||0).toFixed(2), loop:!!n.loop}); }catch(e){} return os(w); };
    n.stop  = function(w){ try{ log({k:'srcStop', ctx:ctx.__id}); }catch(e){} return ost(w); };
    return n;
  };
  const oOsc = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function(){
    const ctx = this; if(ctx.__id==null) ctx.__id = ++cid;
    const n = oOsc.call(this);
    const os = n.start.bind(n);
    n.start = function(w){ try{ log({k:'osc', ctx:ctx.__id, freq:+(n.frequency&&n.frequency.value||0).toFixed(0)}); }catch(e){} return os(w); };
    return n;
  };
}
patch(window.AudioContext); patch(window.webkitAudioContext);
if(window.AudioParam){ const oR = AudioParam.prototype.linearRampToValueAtTime;
  AudioParam.prototype.linearRampToValueAtTime = function(v, t){ try{ log({k:'ramp', to:+v.toFixed(3)}); }catch(e){} return oR.call(this, v, t); }; }
let lastW=null,lastB=null;
setInterval(()=>{ try {
  const w = globalThis.__firstSceneDebug; const b = globalThis.__battleDebug;
  const wc = w && w.musicCue!==undefined ? w.musicCue : null;
  const bc = b && b.musicCue!==undefined ? b.musicCue : null;
  if(wc!==lastW){ log({k:'cue', scope:'world', cue:wc}); lastW=wc; }
  if(bc!==lastB){ log({k:'cue', scope:'battle', cue:bc}); lastB=bc; }
  const ph = b && b.phase; if(ph && ph!==window.__ph){ log({k:'phase', phase:ph}); window.__ph=ph; }
} catch(e){} }, 33);
} catch(e){ window.__initErr = String(e); }
`;
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
async function scenario(name, fn){
  const p = await b.newPage({ viewport:{width:512,height:448}, deviceScaleFactor:2 });
  await p.addInitScript(INIT);
  const out = { name };
  try { await fn(p); } catch(e){ out.error = String(e); }
  out.events = await p.evaluate(()=>window.__au);
  out.initErr = await p.evaluate(()=>window.__initErr??null);
  await p.close();
  return out;
}
const dlg = (p)=>p.evaluate(()=>globalThis.__firstSceneDebug?.dialogueOpen);
async function flush(p){ for(let i=0;i<10 && await dlg(p);i++){ await p.keyboard.press("KeyZ"); await p.waitForTimeout(160);} }
async function mark(p,m){ await p.evaluate((x)=>window.__mark(x), m); }
async function ready(p){ await p.waitForFunction(()=>globalThis.__firstSceneDebug!==undefined,{timeout:20000}).catch(()=>{}); }
const results = [];
results.push(await scenario("intro→overworld", async (p)=>{
  await p.goto(`${BASE}?`, {waitUntil:"networkidle"});
  await ready(p); await p.mouse.click(256,224); await mark(p,"clicked");
  await p.waitForTimeout(4000); await mark(p,"settle");
}));
results.push(await scenario("battle→victory→return", async (p)=>{
  await p.goto(`${BASE}?nointro=1&spawn=2112,1760`, {waitUntil:"networkidle"});
  await ready(p); await p.mouse.click(256,224); await p.waitForTimeout(1200); await flush(p);
  await p.waitForTimeout(1500); await mark(p,"forceEncounter");
  await p.evaluate(()=>globalThis.__forceEncounter(2));
  await p.waitForTimeout(3500); await mark(p,"winning");
  for(let i=0;i<70;i++){ await p.keyboard.press("KeyZ"); await p.waitForTimeout(240);
    const ph = await p.evaluate(()=>globalThis.__battleDebug?.phase ?? null);
    if(ph===null){ await mark(p,"returned"); break; } }
  await p.waitForTimeout(2500);
}));
results.push(await scenario("boss-cue", async (p)=>{
  await p.goto(`${BASE}?nointro=1&spawn=1512,1808`, {waitUntil:"networkidle"});
  await ready(p); await p.mouse.click(256,224); await p.waitForTimeout(1000); await flush(p); await mark(p,"approach");
  for(let i=0;i<16;i++){ await p.keyboard.down("ArrowUp"); await p.waitForTimeout(220); await p.keyboard.up("ArrowUp"); await p.waitForTimeout(110); if(await dlg(p)) await flush(p); const bd=await p.evaluate(()=>globalThis.__battleDebug?.phase??null); if(bd){ await mark(p,"bossBattle"); break; } }
  await p.waitForTimeout(2500);
}));
console.log(JSON.stringify(results));
await b.close();
