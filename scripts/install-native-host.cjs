const fs = require('node:fs');
const path = require('node:path');
const { installNativeHost } = require('../electron/native-installer.cjs');

if (process.platform !== 'darwin') throw new Error('当前安装程序仅支持 macOS。');
const id = process.argv[2];
if (!/^[a-p]{32}$/.test(id || '')) throw new Error('用法：node scripts/install-native-host.cjs <chrome://extensions 中的扩展 ID> [--app /Applications/smartTrans.app]');
const appIndex = process.argv.indexOf('--app');
const appPath = appIndex >= 0 ? path.resolve(process.argv[appIndex + 1] || '') : null;
const hostScript = appPath
  ? path.join(appPath, 'Contents', 'Resources', 'app', 'electron', 'native-host.cjs')
  : path.resolve(__dirname, '..', 'electron', 'native-host.cjs');
const executable = appPath ? path.join(appPath, 'Contents', 'MacOS', 'Electron') : process.execPath;
if (!fs.existsSync(hostScript) || !fs.existsSync(executable)) throw new Error('找不到桥接程序或运行环境，请检查 --app 路径。');
const browsers = installNativeHost(id, { executable, hostScript, electron: Boolean(appPath) });
console.log('已安装：' + browsers.join('、'));
console.log('桥接目标：' + (appPath || '当前源码目录'));
