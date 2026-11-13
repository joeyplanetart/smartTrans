const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const socketPath = path.join(os.homedir(), 'Library', 'Application Support', 'smart-translation', 'browser-bridge.sock');
let buffer = Buffer.alloc(0);
let handled = false;
let replied = false;

function reply(value) {
  if (replied) return;
  replied = true;
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([header, body]), () => process.exit(0));
}
function forward(message) {
  const socket = net.createConnection(socketPath);
  let response = '';
  socket.setEncoding('utf8');
  socket.setTimeout(195000);
  socket.on('connect', () => socket.write(JSON.stringify(message) + '\n'));
  socket.on('data', chunk => {
    response += chunk;
    if (Buffer.byteLength(response, 'utf8') > 1024 * 1024) socket.destroy(new Error('响应过长。'));
    const end = response.indexOf('\n');
    if (end >= 0) {
      try { reply(JSON.parse(response.slice(0, end))); }
      catch { reply({ ok: false, error: '客户端响应无效。' }); }
      socket.end();
    }
  });
  socket.on('timeout', () => socket.destroy(new Error('客户端响应超时。')));
  socket.on('error', error => {
    reply({ ok: false, error: error.code === 'ENOENT' || error.code === 'ECONNREFUSED'
      ? '请先启动 smartTrans 客户端。' : error.message });
  });
}
process.stdin.on('data', chunk => {
  if (handled) return;
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length < 4) return;
  const length = buffer.readUInt32LE(0);
  if (length > 128 * 1024) { handled = true; reply({ ok: false, error: '请求过长。' }); return; }
  if (buffer.length < length + 4) return;
  handled = true;
  try { forward(JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'))); }
  catch { reply({ ok: false, error: '请求格式无效。' }); }
});
