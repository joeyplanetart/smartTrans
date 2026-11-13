const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const SOCKET_NAME = 'browser-bridge.sock';
const MAX_REQUEST = 128 * 1024;

function createBrowserBridge(directory, handle) {
  const socketPath = path.join(directory, SOCKET_NAME);
  fs.mkdirSync(directory, { recursive: true });
  try { fs.unlinkSync(socketPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const server = net.createServer(socket => {
    let input = '';
    let done = false;
    socket.setEncoding('utf8');
    socket.on('data', async chunk => {
      if (done) return;
      input += chunk;
      if (Buffer.byteLength(input, 'utf8') > MAX_REQUEST) {
        done = true;
        socket.end(JSON.stringify({ ok: false, error: '请求过长。' }) + '\n');
        return;
      }
      const end = input.indexOf('\n');
      if (end < 0) return;
      done = true;
      try {
        const response = await handle(JSON.parse(input.slice(0, end)));
        if (!socket.destroyed) socket.end(JSON.stringify(response) + '\n');
      } catch (error) {
        if (!socket.destroyed) socket.end(JSON.stringify({ ok: false, error: error.message }) + '\n');
      }
    });
    socket.on('error', () => {});
  });
  server.listen(socketPath, () => fs.chmodSync(socketPath, 0o600));
  return { server, socketPath, close() {
    server.close();
    try { fs.unlinkSync(socketPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  } };
}

module.exports = { createBrowserBridge, SOCKET_NAME };
