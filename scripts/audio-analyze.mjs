import fs from "node:fs";
const r = JSON.parse(fs.readFileSync(process.env.SCRATCH+"/audio-raw.json","utf8"));
for(const s of r){
  const ev = s.events||[]; if(!ev.length){ console.log("\n### "+s.name+": no events"); continue; }
  const t0 = ev[0].t;
  const rel = (t)=> (t-t0).toFixed(0).padStart(6)+"ms";
  console.log("\n### "+s.name);
  // classify music vs sfx contexts: a ctx that ever plays a long(>5s) buffer is the music ctx
  const musicCtx = new Set();
  for(const e of ev) if(e.k==='src' && e.dur>5) musicCtx.add(e.ctx);
  // print key timeline: marks, cues, phases, music starts/stops, sfx bursts (collapsed)
  let sfxRun=[]; const flushSfx=()=>{ if(sfxRun.length){ console.log(rel(sfxRun[0].t)+"  SFX x"+sfxRun.length+" ("+sfxRun.map(x=>x.k==='osc'?('osc'+x.freq):('n'+(x.dur*1000|0))).slice(0,8).join(",")+")"); sfxRun=[]; } };
  for(const e of ev){
    if(e.k==='src' && e.dur>5){ flushSfx(); console.log(rel(e.t)+"  ♪ MUSIC start  ctx"+e.ctx+" dur="+e.dur+"s loop="+e.loop); }
    else if(e.k==='srcStop' && musicCtx.has(e.ctx)){ flushSfx(); console.log(rel(e.t)+"  ♪ music stop   ctx"+e.ctx); }
    else if((e.k==='src'||e.k==='osc') && !musicCtx.has(e.ctx)){ sfxRun.push(e); }
    else if(e.k==='cue'){ flushSfx(); console.log(rel(e.t)+"  CUE["+e.scope+"] = "+e.cue); }
    else if(e.k==='phase'){ flushSfx(); console.log(rel(e.t)+"  phase: "+e.phase); }
    else if(e.k==='MARK'){ flushSfx(); console.log(rel(e.t)+"  >>> "+e.m); }
  }
  flushSfx();
  // metrics: for each cue change, latency to next music start; overlap windows
  const music = ev.filter(e=>e.k==='src'&&e.dur>5).map(e=>({t:e.t,ctx:e.ctx}));
  const cues = ev.filter(e=>e.k==='cue');
  console.log("--- transitions ---");
  for(const c of cues){ const next = music.find(m=>m.t>=c.t-5); const lat = next? (next.t-c.t).toFixed(0):"—"; console.log("  cue "+c.cue+" -> next music start +"+lat+"ms"); }
}
