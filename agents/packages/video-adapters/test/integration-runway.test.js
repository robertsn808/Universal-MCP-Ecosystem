#!/usr/bin/env node
/*
  Integration smoke for Runway real mode. Skips unless RUNWAY_USE_REAL=1 and RUNWAY_API_KEY present.
*/
const { createProvider } = require('../dist/index.js');

async function main() {
  if (!(process.env.RUNWAY_USE_REAL === '1' && process.env.RUNWAY_API_KEY)) {
    console.log('SKIP: RUNWAY_USE_REAL=1 and RUNWAY_API_KEY required');
    return;
  }
  const p = createProvider('runway');
  const { id } = await p.start({ prompt: 'test clip', durationSeconds: 4 });
  console.log('started', id);
  for (let i = 0; i < 60; i++) {
    const st = await p.status(id);
    console.log('status', st.status, st.progress);
    if (st.status === 'succeeded' || st.status === 'failed' || st.status === 'canceled') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

