const { test, expect } = require("bun:test");
const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const { renderMarkdown, sanitizeNoteHtml } = require("../src/markdown-renderer.js");
test("Jira descriptions render headings, numbered lists and tables safely", () => {
  const window = new JSDOM("").window;
  const purify = createDOMPurify(window);
  const html = renderMarkdown("# Title\n\n3. Item\n\n| Name | Value |\n| --- | --- |\n| Total | 100 |", purify);
  expect(html).toContain("<h1>Title</h1>");
  expect(html).toContain('start="3"');
  expect(html).toContain("<table>");
  expect(html).toContain("<td>Total</td>");
  window.close();
});
test("note formatting keeps headings, bold text and lists but strips active content", () => {
  const window = new JSDOM("").window;
  const purify = createDOMPurify(window);
  const html = sanitizeNoteHtml('<h2>计划</h2><ul><li><strong>完成</strong></li></ul><img src=x onerror=alert(1)><script>alert(1)</script>', purify);
  expect(html).toContain('<h2>计划</h2>');
  expect(html).toContain('<ul><li><strong>完成</strong></li></ul>');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('onerror');
  window.close();
});
test("note HTML accepts local screenshot data but refuses remote and SVG images", () => {
  const window = new JSDOM("").window;
  const purify = createDOMPurify(window);
  const html = sanitizeNoteHtml('<img src="data:image/png;base64,aGVsbG8=" alt="截图"><img src="https://example.com/a.png"><img src="data:image/svg+xml;base64,PHN2Zz4=">', purify);
  expect(html).toContain('data:image/png;base64,aGVsbG8=');
  expect(html).not.toContain('https://example.com');
  expect(html).not.toContain('svg+xml');
  window.close();
});
test("note HTML preserves task checks, underline and strike while rejecting unrelated attributes", () => {
  const window = new JSDOM("").window;
  const purify = createDOMPurify(window);
  const html = sanitizeNoteHtml('<ul data-task-list="1"><li data-done="1"><u>重要</u> <s>旧任务</s></li><li data-done="0">新任务</li></ul><p data-done="1" onclick="alert(1)">正文</p>', purify);
  expect(html).toContain('<ul data-task-list="1">');
  expect(html).toContain('<li data-done="1"><u>重要</u> <s>旧任务</s></li>');
  expect(html).toContain('<li data-done="0">新任务</li>');
  expect(html).not.toContain('onclick');
  expect(html).not.toContain('<p data-done');
  window.close();
});
test("remote Jira HTML cannot execute scripts, event handlers or load images", () => {
  const window = new JSDOM("").window;
  const purify = createDOMPurify(window);
  const html = renderMarkdown('<script>alert(1)</script><img src="https://tracker.example" onerror="alert(1)"><a href="javascript:alert(1)">Click</a>\n\n[Safe](https://example.com)', purify);
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("onerror");
  expect(html).not.toContain("javascript:");
  expect(html).toContain('href="https://example.com"');
  window.close();
});
