const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

if (process.platform !== "darwin") throw new Error("请在 macOS 上打包。");
const root = path.resolve(__dirname, "..");
execFileSync(process.execPath, [path.join(__dirname, "ensure-electron.cjs")], { stdio: "inherit" });
const electronDir = path.dirname(require.resolve("electron/package.json"));
const source = path.join(electronDir, "dist", "Electron.app");
if (!fs.existsSync(source)) throw new Error("请先运行 bun install 和 bun run start。");
const destination = path.join(root, "dist", "smartTrans.app");
if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
execFileSync("ditto", [source, destination]);
const contents = path.join(destination, "Contents");
const resources = path.join(contents, "Resources");
const appDirectory = path.join(resources, "app");
fs.mkdirSync(appDirectory, { recursive: true });
for (const name of ["electron", "src"]) {
  fs.cpSync(path.join(root, name), path.join(appDirectory, name), { recursive: true });
}
const metadata = require("../package.json");
fs.writeFileSync(path.join(appDirectory, "package.json"), JSON.stringify({
  name: metadata.name, version: metadata.version, main: metadata.main,
}));
fs.copyFileSync(path.join(root, "assets", "smartTrans.icns"), path.join(resources, "smartTrans.icns"));
const plist = path.join(contents, "Info.plist");
for (const [key, value] of Object.entries({
  CFBundleName: "smartTrans",
  CFBundleDisplayName: "smartTrans",
  CFBundleIdentifier: "com.joeyplanetart.smarttrans",
  CFBundleIconFile: "smartTrans.icns",
  CFBundleShortVersionString: metadata.version,
  CFBundleVersion: metadata.version,
})) {
  execFileSync("plutil", ["-replace", key, "-string", value, plist]);
}
execFileSync("codesign", ["--force", "--deep", "--sign", "-", destination], { stdio: "inherit" });
execFileSync("codesign", ["--verify", "--deep", "--strict", destination], { stdio: "inherit" });
console.log("已打包：" + destination);
