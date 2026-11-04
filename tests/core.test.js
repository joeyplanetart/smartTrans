const { test, expect } = require("bun:test");
const { protectMarkdown, protectJiraText } = require("../electron/markdown.cjs");
const { History, detectLanguage } = require("../src/editor-core.js");

test("translation changes prose while syntax, code, URLs, indentation and CRLF survive", () => {
  const source = "## 标题\r\n\r\n1. **重点** [链接](https://example.com/a)\r\n    - 嵌套\r\n~~~js\r\nconst a = '中文';\r\n~~~\r\n";
  const protectedText = protectMarkdown(source);
  expect(protectedText.masked).not.toContain("https://");
  expect(protectedText.masked).not.toContain("const a");
  expect(protectedText.restore(protectedText.masked.replace("标题", "Title").replace("重点", "Key").replace("链接", "Link").replace("嵌套", "Nested")))
    .toBe("## Title\r\n\r\n1. **Key** [Link](https://example.com/a)\r\n    - Nested\r\n~~~js\r\nconst a = '中文';\r\n~~~\r\n");
});
test("missing, duplicated and reordered Markdown tokens cannot be applied", () => {
  const value = protectMarkdown("## 标题\n\n**正文**");
  const tokens = value.masked.match(/⟦[^⟧]+⟧/g);
  expect(() => value.restore(value.masked.replace(tokens[0], ""))).toThrow();
  expect(() => value.restore(tokens[0] + value.masked)).toThrow();
  expect(() => value.restore(value.masked.replace(tokens[0], "TEMP").replace(tokens[1], tokens[0]).replace("TEMP", tokens[1]))).toThrow();
  expect(() => value.restore(value.masked + "\nextra")).toThrow();
});
test("stream preview never shows a partial protection token", () => {
  const value = protectMarkdown("## 标题");
  const token = value.masked.match(/⟦[^⟧]+⟧/)[0];
  for (let length = 1; length < token.length; length++) expect(value.restore("Title " + token.slice(0, length), true)).toBe("Title ");
});
test("Jira field names, email addresses, UUIDs and escaped table characters stay opaque", () => {
  const source = "Keep User\\_ID and related_design_id for qa@example.com, id 12345678-abcd-1234-5678-123456789abc. A \\| B.";
  const guarded = protectMarkdown(source);
  expect(guarded.masked).not.toContain("User");
  expect(guarded.masked).not.toContain("related_design_id");
  expect(guarded.masked).not.toContain("qa@example.com");
  expect(guarded.masked).not.toContain("12345678-abcd");
  expect(guarded.restore(guarded.masked)).toBe(source);
});
test("Jira translation accepts added newlines and different emphasis without Markdown failures", () => {
  const guarded = protectJiraText("## Title\n\n**Description** with User_ID and https://example.com.");
  const translated = guarded.masked.replace("## Title", "标题").replace("**Description**", "描述") + "\n\n";
  expect(guarded.restore(translated)).toContain("标题\n\n描述 with User_ID");
  expect(guarded.restore(translated)).toContain("https://example.com");
  const strict = protectMarkdown("## Title");
  expect(() => strict.restore(strict.masked + "\n")).toThrow("Markdown");
});
test("Jira mode still protects code, row markers and technical values", () => {
  const source = "`SMARTTRANS_JIRA_WEB_1_0`\n\nField User_ID\n\n```js\nconst a = 1;\n```";
  const guarded = protectJiraText(source);
  expect(guarded.masked).not.toContain("const a");
  expect(guarded.restore(guarded.masked + "\n")).toBe(source + "\n");
  expect(() => guarded.restore(guarded.masked.replace(/⟦[^⟧]+⟧/, ""))).toThrow("关键内容");
});
test("undo and redo restore replace and insertion as separate transactions", () => {
  const state = (value) => ({ value, start: value.length, end: value.length });
  const history = new History(state("中文"));
  history.record(state("Chinese"));
  history.record(state("Chinese\n\n中文"));
  expect(history.undo().value).toBe("Chinese");
  expect(history.undo().value).toBe("中文");
  expect(history.redo().value).toBe("Chinese");
  history.record(state("new edit"));
  expect(history.redo()).toBeNull();
});
test("typing groups undo without swallowing a previous replace action", () => {
  const s = (value) => ({ value, start: value.length, end: value.length });
  const history = new History(s("原文"));
  history.record(s("Translation"), null, 1000);
  history.record(s("Translation a"), "typing", 1100);
  history.record(s("Translation ab"), "typing", 1200);
  expect(history.undo().value).toBe("Translation");
  expect(history.undo().value).toBe("原文");
});
test("mixed-language detection follows prose rather than technical terms or URLs", () => {
  expect(detectLanguage("这个页面没有 edit design 入口了").target).toBe("en");
  expect(detectLanguage("Please translate this 中文 phrase into clear English.").target).toBe("zh");
  expect(detectLanguage("你好 https://example.com/long/path").target).toBe("en");
  expect(detectLanguage("")).toEqual({ source: "自动识别", target: "en" });
});
