const { test, expect } = require("bun:test");
const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const { renderMarkdown } = require("../src/markdown-renderer.js");
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
