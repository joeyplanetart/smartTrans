const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

async function main() {
  const electronDir = path.dirname(require.resolve("electron/package.json"));
  const packageInfo = require("electron/package.json");
  const relativeBinary = process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron"
    : process.platform === "win32" ? "electron.exe" : "electron";
  const binary = path.join(electronDir, "dist", relativeBinary);
  if (fs.existsSync(binary)) {
    fs.writeFileSync(path.join(electronDir, "path.txt"), relativeBinary);
    return;
  }
  const { downloadArtifact } = require("@electron/get");
  const archive = await downloadArtifact({
    version: packageInfo.version,
    artifactName: "electron",
    platform: process.platform,
    arch: process.arch,
    checksums: require("electron/checksums.json"),
  });
  const destination = path.join(electronDir, "dist");
  fs.mkdirSync(destination, { recursive: true });
  if (process.platform === "win32") {
    await require("extract-zip")(archive, { dir: destination });
  } else {
    execFileSync("unzip", ["-q", "-o", archive, "-d", destination], { timeout: 180000 });
  }
  if (!fs.existsSync(binary)) throw new Error("Electron 二进制安装失败。");
  fs.writeFileSync(path.join(electronDir, "path.txt"), relativeBinary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
