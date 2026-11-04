const { test, expect } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { JiraConnections } = require("../electron/jira-connections.cjs");
test("session-only credentials are not written to disk; saving requires system encryption", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smarttrans-test-"));
  try {
    const storage = new JiraConnections(directory, { isEncryptionAvailable: () => false });
    const value = { email: "test@example.com", token: "fixture-token" };
    storage.set("https://planetart.atlassian.net", value, false);
    expect(storage.get("https://planetart.atlassian.net")).toEqual(value);
    expect(fs.readFileSync(storage.file, "utf8")).not.toContain("fixture-token");
    expect(() => storage.set("https://planetart.atlassian.net", value, true)).toThrow("系统加密存储不可用");
    storage.remove("https://planetart.atlassian.net");
    expect(storage.get("https://planetart.atlassian.net")).toBeNull();
  } finally { fs.rmSync(directory, { recursive: true }); }
});
