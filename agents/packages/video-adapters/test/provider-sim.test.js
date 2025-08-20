#!/usr/bin/env node
const { createProvider } = require('../dist/index.js');

async function main() {
  const p = createProvider('runway');
  // Forge a simulated ID in the past so status becomes succeeded
  const pastTs = Date.now() - 30000;
  const id = `sim-${pastTs}`;
  const st = await p.status(id);
  if (st.status !== 'succeeded' || !(st.artifacts || []).length) {
    console.error('expected succeeded with at least one artifact', st);
    process.exit(1);
  }
  console.log('ok', st.progress, 'artifacts:', st.artifacts.length);
}

main().catch((e) => { console.error(e); process.exit(1); });

