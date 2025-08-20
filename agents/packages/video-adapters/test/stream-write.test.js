#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const os = require('os');
const { createStorage } = require('storage');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'va-test-'));
  process.env.STORAGE_PROVIDER = 'local';
  process.env.ARTIFACTS_DIR = tmp;
  const storage = createStorage();
  const key = 'test/stream.bin';
  const data = Buffer.from('hello-stream');
  const readable = Readable.from(data);
  await storage.putObject({ key, body: readable, contentType: 'application/octet-stream' });
  const outPath = path.join(tmp, key);
  const exists = fs.existsSync(outPath);
  if (!exists) { console.error('file not written'); process.exit(1); }
  const got = fs.readFileSync(outPath);
  if (Buffer.compare(got, data) !== 0) { console.error('content mismatch'); process.exit(2); }
  console.log('ok', outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });

