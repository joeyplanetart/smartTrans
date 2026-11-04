const fs = require("node:fs");
const path = require("node:path");
class JiraConnections {
  constructor(directory, encryption) {
    this.file = path.join(directory, "jira-connections.json");
    this.encryption = encryption;
    this.memory = new Map();
  }
  saved() {
    try { return JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { return {}; }
  }
  get(origin) {
    if (this.memory.has(origin)) return this.memory.get(origin);
    const encrypted = this.saved()[origin];
    if (!encrypted || !this.encryption.isEncryptionAvailable()) return null;
    try {
      const value = JSON.parse(this.encryption.decryptString(Buffer.from(encrypted, "base64")));
      this.memory.set(origin, value);
      return value;
    } catch { return null; }
  }
  set(origin, value, remember) {
    const saved = this.saved();
    if (remember) {
      if (!this.encryption.isEncryptionAvailable()) throw new Error("系统加密存储不可用，请取消勾选「加密保存」，仅在本次运行中使用。");
      saved[origin] = this.encryption.encryptString(JSON.stringify(value)).toString("base64");
    } else delete saved[origin];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify(saved), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    this.memory.set(origin, value);
  }
  remove(origin) {
    const saved = this.saved();
    delete saved[origin];
    fs.writeFileSync(this.file, JSON.stringify(saved), { mode: 0o600 });
    this.memory.delete(origin);
  }
}
module.exports = { JiraConnections };
