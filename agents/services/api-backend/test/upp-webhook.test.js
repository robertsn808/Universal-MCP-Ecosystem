#!/usr/bin/env node
const http = require('http');
const crypto = require('crypto');

const payload = JSON.stringify({ type: 'test.event', data: { ok: true }, ts: new Date().toISOString() });
const secret = process.env.UPP_WEBHOOK_SECRET || 'secret123';

function sign(body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function req(sig, cb) {
  const opts = {
    hostname: 'localhost', port: 8080, path: '/webhooks/upp', method: 'POST',
    headers: { 'content-type': 'application/json', 'x-upp-signature': sig, 'x-upp-event-id': 'evt_test_1' }
  };
  const r = http.request(opts, (res) => {
    let buf=''; res.on('data', c=>buf+=c); res.on('end', ()=> cb(null, res.statusCode, buf));
  });
  r.on('error', cb); r.write(payload); r.end();
}

const mode = process.argv.includes('--bad') ? 'bad' : 'ok';
const sig = mode === 'ok' ? sign(payload) : 'invalid';
req(sig, (err, status, body) => {
  if (err) return (console.error('ERR', err), process.exit(1));
  console.log('status', status, 'body', body);
  process.exit(status === 200 ? 0 : 1);
});

