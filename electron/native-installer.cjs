const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function installNativeHost(id, { executable, hostScript, electron = false, home = os.homedir(), browsers } = {}) {
  if (process.platform !== 'darwin') throw new Error('浏览器桥接目前仅支持 macOS。');
  if (!/^[a-p]{32}$/.test(id || '')) throw new Error('请填写 chrome://extensions 页面显示的 32 位扩展 ID。');
  if (!fs.existsSync(executable) || !fs.existsSync(hostScript)) throw new Error('找不到浏览器桥接程序。');
  const available = browsers || ['Google/Chrome', 'Microsoft Edge'].filter(browser =>
    fs.existsSync(path.join(home, 'Library', 'Application Support', browser)));
  if (!available.length) throw new Error('未找到 Chrome 或 Edge 的浏览器数据目录。请先启动浏览器并加载扩展。');
  const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
  const support = path.join(home, 'Library', 'Application Support', 'smart-translation');
  fs.mkdirSync(support, { recursive: true });
  const launcher = path.join(support, 'browser-native-host.sh');
  fs.writeFileSync(launcher, '#!/bin/sh\n' + (electron ? 'export ELECTRON_RUN_AS_NODE=1\n' : '') +
    'exec ' + quote(executable) + ' ' + quote(hostScript) + '\n', { mode: 0o700 });
  fs.chmodSync(launcher, 0o700);
  const manifest = { name: 'com.joeyplanetart.smarttrans', description: 'smartTrans browser bridge',
    path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] };
  for (const browser of available) {
    const directory = path.join(home, 'Library', 'Application Support', browser, 'NativeMessagingHosts');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, manifest.name + '.json');
    if (fs.existsSync(file)) {
      try {
        const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (previous.name === manifest.name && Array.isArray(previous.allowed_origins)) {
          manifest.allowed_origins = [...new Set([...manifest.allowed_origins, ...previous.allowed_origins
            .filter(origin => /^chrome-extension:\/\/[a-p]{32}\/$/.test(origin))])];
        }
      } catch { /* Replace a damaged manifest with a valid one. */ }
    }
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  }
  return available.map(browser => browser === 'Google/Chrome' ? 'Chrome' : 'Edge');
}

module.exports = { installNativeHost };
