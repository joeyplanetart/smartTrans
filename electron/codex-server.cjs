const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const { EventEmitter } = require("node:events");

class CodexServer extends EventEmitter {
  constructor(binary, cwd, env) {
    super();
    this.pending = new Map();
    this.sequence = 0;
    this.child = spawn(binary, ["app-server", "--listen", "stdio://"], {
      cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32",
    });
    this.child.stderr.on("data", () => {});
    this.child.stdin.on("error", () => {});
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id !== undefined && message.method) {
        // Translation never needs user approvals or external tools.
        this.send({ id: message.id, error: { code: -32601, message: "Tools are unavailable for translation." } });
      } else if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else this.emit("notification", message);
    });
    const died = () => {
      this.closed = true;
      for (const task of this.pending.values()) {
        clearTimeout(task.timer);
        task.reject(new Error("Codex 后台进程已退出，请重试。"));
      }
      this.pending.clear();
      this.emit("stopped");
    };
    this.child.on("error", died);
    this.child.on("close", died);
    this.ready = this.request("initialize", {
      clientInfo: { name: "smarttrans", title: "smartTrans", version: "0.2.0" },
      capabilities: null,
    }).then(() => this.send({ method: "initialized", params: {} }));
  }
  send(message) {
    if (!this.closed) this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  request(method, params) {
    if (this.closed) return Promise.reject(new Error("Codex 后台进程已退出。"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex 请求超时，请重试。"));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  stop() {
    if (this.closed) return;
    try { process.kill(-this.child.pid, "SIGTERM"); } catch { this.child.kill(); }
  }
}

module.exports = { CodexServer };
