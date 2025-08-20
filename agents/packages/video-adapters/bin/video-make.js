#!/usr/bin/env node
/* eslint-disable no-console */
const axios = require('axios');
const { createReadStream } = require('fs');
const fs = require('fs');
const path = require('path');
const { createStorage } = require('storage');
const { createProvider } = require('../dist/index.js');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const provider = (args.provider || 'runway');
  const prompt = args.prompt || '';
  const duration = args.duration ? Number(args.duration) : undefined;
  const style = args.style;
  const seed = args.seed ? Number(args.seed) : undefined;
  const upload = args.upload === '1' || args.upload === 'true';
  const keyPrefix = args['key-prefix'] || `video/cli-${Date.now()}`;

  const p = createProvider(provider);
  const { id } = await p.start({ prompt, durationSeconds: duration, style, seed });
  console.log(`started provider=${provider} id=${id}`);

  let last = 0;
  for (let i = 0; i < 600; i++) {
    const st = await p.status(id);
    if (st.progress !== last) {
      last = st.progress;
      process.stdout.write(`\rprogress ${st.progress}%   `);
    }
    if (st.status === 'succeeded') {
      console.log(`\nstatus=succeeded`);
      const outFiles = [];
      if (upload) {
        const storage = createStorage();
        for (let idx = 0; idx < (st.artifacts || []).length; idx++) {
          const art = st.artifacts[idx];
          const filename = art.filename || `output-${idx + 1}.mp4`;
          const key = `${keyPrefix}/${filename}`;
          if (art.url.startsWith('http')) {
            const resp = await axios.get(art.url, { responseType: 'stream' });
            await storage.putObject({ key, body: resp.data, contentType: art.contentType || resp.headers['content-type'] });
          } else if (art.url.startsWith('data:')) {
            const b64 = art.url.split(',')[1] || '';
            const buf = Buffer.from(b64, 'base64');
            await storage.putObject({ key, body: buf, contentType: art.contentType || 'video/mp4' });
          }
          outFiles.push({ key, url: storage.baseUrl() ? `${storage.baseUrl()}/${key}` : undefined });
        }
      } else {
        // Save to local files
        for (let idx = 0; idx < (st.artifacts || []).length; idx++) {
          const art = st.artifacts[idx];
          const filename = art.filename || `output-${idx + 1}.mp4`;
          const filePath = path.resolve(process.cwd(), filename);
          if (art.url.startsWith('http')) {
            const resp = await axios.get(art.url, { responseType: 'arraybuffer' });
            fs.writeFileSync(filePath, Buffer.from(resp.data));
          } else if (art.url.startsWith('data:')) {
            const b64 = art.url.split(',')[1] || '';
            const buf = Buffer.from(b64, 'base64');
            fs.writeFileSync(filePath, buf);
          }
          outFiles.push({ file: filePath });
        }
      }
      console.log(JSON.stringify({ provider, id, files: outFiles }, null, 2));
      process.exit(0);
    }
    if (st.status === 'failed' || st.status === 'canceled') {
      console.error(`\nstatus=${st.status} error=${st.error || ''}`);
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('\ntimeout');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

