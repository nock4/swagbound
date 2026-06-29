export const meta = {
  name: 'hero-sprite-state-matrix-fleet',
  description: 'Fan the hero visual-state test matrix across facings (parallel agents) + synthesize coverage',
  phases: [{ title: 'Matrix', detail: 'one agent per facing runs the in-engine state matrix' }]
}

const REPO = '/Users/nickgeorge-studio/Projects/coilsnake-tutorial-experiment'
const FACINGS = ['down', 'up', 'left', 'right']
const SLICE_SCHEMA = {
  type: 'object', additionalProperties: true, required: ['facing', 'pass', 'total', 'results'],
  properties: {
    facing: { type: 'string' }, pass: { type: 'integer' }, total: { type: 'integer' },
    results: { type: 'array', items: { type: 'object', additionalProperties: true, required: ['state', 'ok'], properties: {
      state: { type: 'string' }, ok: { type: 'boolean' }, baseState: { type: 'string' }, sheetSwapped: { type: 'boolean' }, rendered: { type: 'boolean' }
    } } }
  }
}

phase('Matrix')
const slices = await parallel(FACINGS.map((f) => () =>
  agent(
    `In the repo ${REPO}, run EXACTLY this one command and let it finish (it drives a headless browser against the dev server on :5173, ~30-60s):\n\n    node scripts/sprite-state-matrix.mjs --facing ${f}\n\nIt prints a single JSON line to stdout of the form {"facing","pass","total","results":[{state,ok,baseState,sheetSwapped,rendered}]}. Return THAT JSON object exactly as your structured output (do not modify it). If the command errors, return {facing:"${f}",pass:0,total:7,results:[]}.`,
    { label: `matrix:${f}`, phase: 'Matrix', schema: SLICE_SCHEMA }
  )
))

const ok = slices.filter(Boolean)
const cells = ok.flatMap((s) => s.results.map((r) => ({ facing: s.facing, ...r })))
const failures = cells.filter((c) => !c.ok)
const totalPass = cells.filter((c) => c.ok).length
log(`facings covered: ${ok.length}/4; cells passing: ${totalPass}/${cells.length}; failures: ${failures.length}`)
return {
  facingsCovered: ok.length,
  cellsPassing: totalPass,
  cellsTotal: cells.length,
  perFacing: ok.map((s) => ({ facing: s.facing, pass: s.pass, total: s.total })),
  failures
}
