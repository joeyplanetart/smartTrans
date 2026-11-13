const { test, expect } = require('bun:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createBrowserBridge } = require('../electron/browser-bridge.cjs');
const { installNativeHost } = require('../electron/native-installer.cjs');

test('native host forwards framed requests to the local bridge', async () => {
  const home = fs.mkdtempSync('/tmp/st-browser-');
  const directory = path.join(home, 'Library', 'Application Support', 'smart-translation');
  const bridge = createBrowserBridge(directory, async request => ({ ok: true, echo: request.text }));
  try {
    await new Promise(resolve => bridge.server.once('listening', resolve));
    const electron = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
    for (const executable of [process.execPath, ...(fs.existsSync(electron) ? [electron] : [])]) {
      const host = spawn(executable, [path.join(__dirname, '..', 'electron', 'native-host.cjs')],
        { env: { ...process.env, HOME: home, ...(executable === electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
          stdio: ['pipe', 'pipe', 'pipe'] });
      const body = Buffer.from(JSON.stringify({ type: 'translate', text: '你好\nworld' }));
      const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
      host.stdin.end(Buffer.concat([header, body]));
      const chunks = [];
      for await (const chunk of host.stdout) chunks.push(chunk);
      const result = Buffer.concat(chunks);
      expect(result.readUInt32LE(0)).toBe(result.length - 4);
      expect(JSON.parse(result.subarray(4).toString())).toEqual({ ok: true, echo: '你好\nworld' });
    }
  } finally {
    bridge.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('installer registers extension origins for Chrome and Edge', () => {
  const home = fs.mkdtempSync('/tmp/st-install-');
  const options = { home, executable: process.execPath, browsers: ['Google/Chrome', 'Microsoft Edge'],
    hostScript: path.join(__dirname, '..', 'electron', 'native-host.cjs') };
  try {
    installNativeHost('a'.repeat(32), options);
    installNativeHost('b'.repeat(32), options);
    for (const browser of ['Google/Chrome', 'Microsoft Edge']) {
      const file = path.join(home, 'Library', 'Application Support', browser, 'NativeMessagingHosts', 'com.joeyplanetart.smarttrans.json');
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(manifest.allowed_origins).toContain('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/');
      expect(manifest.allowed_origins).toContain('chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/');
      expect(fs.statSync(manifest.path).mode & 0o111).toBeGreaterThan(0);
    }
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('native host reports when the desktop app is not running', async () => {
  const home = fs.mkdtempSync('/tmp/st-offline-');
  try {
    const host = spawn(process.execPath, [path.join(__dirname, '..', 'electron', 'native-host.cjs')],
      { env: { ...process.env, HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
    const body = Buffer.from(JSON.stringify({ type: 'status' }));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    host.stdin.end(Buffer.concat([header, body]));
    const chunks = [];
    for await (const chunk of host.stdout) chunks.push(chunk);
    const result = Buffer.concat(chunks);
    expect(result.readUInt32LE(0)).toBe(result.length - 4);
    expect(JSON.parse(result.subarray(4).toString()).error).toContain('请先启动 smartTrans');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('installer skips a browser that has never been used', () => {
  const home = fs.mkdtempSync('/tmp/st-chrome-only-');
  const chromeProfile = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  fs.mkdirSync(chromeProfile, { recursive: true });
  try {
    const browsers = installNativeHost('a'.repeat(32), { home, executable: process.execPath,
      hostScript: path.join(__dirname, '..', 'electron', 'native-host.cjs') });
    expect(browsers).toEqual(['Chrome']);
    expect(fs.existsSync(path.join(home, 'Library', 'Application Support', 'Microsoft Edge'))).toBe(false);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
