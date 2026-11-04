const { test, expect } = require("bun:test");
const { parseJiraUrl, adfMarkdown, issueDocument, readIssue, resolveConnection, importIssueJson, issueApiUrl } = require("../electron/jira.cjs");
const { batches, splitTranslation } = require("../src/jira-core.js");
const { protectMarkdown } = require("../electron/markdown.cjs");
const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const issue = {
  key: "WEB-128110",
  fields: {
    summary: "Update checkout",
    description: { type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Acceptance criteria" }] },
      paragraph("Keep the original order."),
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph("Show a confirmation.")] }] },
      { type: "table", content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [paragraph("Name")] }, { type: "tableHeader", content: [paragraph("Value")] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [paragraph("Total")] }, { type: "tableCell", content: [paragraph("100")] }] },
      ] },
      { type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "const total = 100;" }] },
    ] },
  },
};

test("Jira URLs normalize keys and reject credentialed, spoofed, local and non-HTTPS hosts", () => {
  expect(parseJiraUrl("https://planetart.atlassian.net/browse/web-128110?x=y").key).toBe("WEB-128110");
  for (const url of ["file:///etc/passwd", "http://planetart.atlassian.net/browse/WEB-1",
    "https://planetart.atlassian.net.evil.com/browse/WEB-1", "https://user:pass@planetart.atlassian.net/browse/WEB-1",
    "https://localhost/browse/WEB-1", "https://planetart.atlassian.net/rest/api/3/myself"]) {
    expect(() => parseJiraUrl(url)).toThrow();
  }
});
test("ADF headings, lists, tables and code form readable Markdown blocks", () => {
  const document = issueDocument(issue, parseJiraUrl("https://planetart.atlassian.net/browse/WEB-128110"));
  expect(document.blocks.length).toBe(6);
  expect(document.blocks[1].markdown).toBe("## Acceptance criteria");
  expect(document.blocks[3].markdown).toBe("- Show a confirmation.");
  expect(document.blocks[4].markdown).toContain("| Name | Value |\n| --- | --- |");
  expect(document.blocks[5].markdown).toBe("```js\nconst total = 100;\n```");
  expect(adfMarkdown({ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] })).toBe("click");
});
test("read-only Jira fetch requests only selected fields and never changes issue history", async () => {
  const calls = [];
  const result = await readIssue("https://planetart.atlassian.net/browse/WEB-128110", async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(url.includes("/comment?") ? { comments: [], startAt: 0, total: 0 } : issue), { headers: { "content-type": "application/json" } });
  });
  expect(result.ok).toBe(true);
  expect(calls[0].init.method).toBe("GET");
  expect(calls[0].url).toContain("updateHistory=false");
  expect(calls[0].url).not.toContain("comment");
});
test("anonymous and permission failures have different next steps", async () => {
  const auth = await readIssue("https://planetart.atlassian.net/browse/WEB-128110",
    async () => new Response("{}", { status: 401, headers: { "content-type": "application/json" } }));
  expect(auth.code).toBe("AUTH_REQUIRED");
  await expect(readIssue("https://planetart.atlassian.net/browse/WEB-128110",
    async (url) => new Response("{}", { status: url.endsWith("/myself") ? 200 : 404, headers: { "content-type": "application/json" } }))).rejects.toThrow("没有查看权限");
});
test("translation groups preserve stable row markers and refuse broken alignment", () => {
  const blocks = [{ id: "a", markdown: "# Title" }, { id: "b", markdown: "Details" }];
  const [group] = batches(blocks, "WEB_1");
  const guarded = protectMarkdown(group.text);
  const translated = guarded.restore(guarded.masked.replace("Title", "标题").replace("Details", "详情"));
  expect(splitTranslation(translated, group)).toEqual([{ id: "a", text: "# 标题" }, { id: "b", text: "详情" }]);
  expect(splitTranslation(group.rows[0].marker + "\n\n# 标", group, true)).toEqual([{ id: "a", text: "# 标" }]);
  expect(() => splitTranslation(translated.replace(group.rows[1].marker, ""), group)).toThrow();
  expect(() => splitTranslation(group.rows[0].marker + translated, group)).toThrow();
  expect(batches(blocks, "WEB_1")[0].text).toBe(group.text);
  expect(batches(blocks, "WEB_1", 45).length).toBe(2);
  expect(splitTranslation("以下是翻译：\n\n```markdown\n" + translated + "\n```", group)).toEqual([
    { id: "a", text: "# 标题" }, { id: "b", text: "详情" },
  ]);
});
test("scoped tokens resolve Cloud ID without credentials then use only the Atlassian API gateway", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    const value = url.endsWith("/_edge/tenant_info") ? { cloudId: "58d17b0e-b3cc-4ada-8ab4-94d9086dadc9" }
      : url.includes("/comment?") ? { comments: [], startAt: 0, total: 0 } : issue;
    return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  };
  const connection = await resolveConnection("https://planetart.atlassian.net/browse/WEB-128110",
    { email: "qa@example.com", token: "fake-test-token", kind: "scoped" }, fetcher);
  expect(calls[0].init.headers).toBeUndefined();
  await readIssue("https://planetart.atlassian.net/browse/WEB-128110", fetcher, connection);
  expect(calls[1].url).toStartWith("https://api.atlassian.com/ex/jira/58d17b0e-b3cc-4ada-8ab4-94d9086dadc9/rest/api/3/issue/WEB-128110");
  expect(calls[1].init.headers.Authorization).toStartWith("Basic ");
  expect(calls[1].init.redirect).toBe("manual");
});
const comment = (id, created, text) => ({
  id, created, updated: created, author: { displayName: "Reviewer " + id },
  self: "https://planetart.atlassian.net/rest/api/3/issue/WEB-128110/comment/" + id,
  body: { type: "doc", content: [paragraph(text)] },
});
test("all comment pages are read and sorted by creation time without translating author metadata", async () => {
  const calls = [];
  const result = await readIssue("https://planetart.atlassian.net/browse/WEB-128110", async (url) => {
    calls.push(url);
    const value = !url.includes("/comment?") ? issue : url.includes("startAt=0")
      ? { startAt: 0, total: 3, comments: [comment("2", "2026-11-02T00:00:00Z", "Second"), comment("1", "2026-11-01T00:00:00Z", "First")] }
      : { startAt: 2, total: 3, comments: [comment("3", "2026-11-03T00:00:00Z", "Third")] };
    return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  });
  expect(calls[2]).toContain("startAt=2");
  expect(result.issue.comments.map((c) => c.id)).toEqual(["1", "2", "3"]);
  expect(result.issue.commentsComplete).toBe(true);
  const block = result.issue.blocks.find((b) => b.id === "comment-1");
  expect(block.markdown).toBe("First");
  expect(block.comment.author).toBe("Reviewer 1");
  expect(block.markdown).not.toContain("Reviewer");
});
test("browser import reports partial comments, merges the next page and rejects unrelated comments", () => {
  const url = "https://planetart.atlassian.net/browse/WEB-128110";
  const initial = importIssueJson(url, JSON.stringify({ ...issue, fields: { ...issue.fields, comment: {
    startAt: 0, total: 2, comments: [comment("1", "2026-11-01T00:00:00Z", "First")],
  } } }));
  expect(initial.commentsComplete).toBe(false);
  expect(initial.commentsNextStartAt).toBe(1);
  const page = { startAt: 1, total: 2, comments: [comment("2", "2026-11-02T00:00:00Z", "Second")] };
  const merged = importIssueJson(url, JSON.stringify(page), initial);
  expect(merged.commentsComplete).toBe(true);
  expect(merged.comments.length).toBe(2);
  expect(merged.blocks.filter((b) => b.comment).length).toBe(2);
  expect(() => importIssueJson(url, JSON.stringify(page), merged)).toThrow("已经导入");
  const wrong = structuredClone(page);
  wrong.comments[0].self = wrong.comments[0].self.replace("WEB-128110", "WEB-999");
  expect(() => importIssueJson(url, JSON.stringify(wrong), initial)).toThrow("不属于当前票据");
  expect(issueApiUrl(url)).toContain(",comment");
});
test("comment permission or pagination failures do not silently claim a complete ticket", async () => {
  const url = "https://planetart.atlassian.net/browse/WEB-128110";
  await expect(readIssue(url, async (input) => new Response(JSON.stringify(issue),
    { status: input.includes("/comment?") ? 403 : 200, headers: { "content-type": "application/json" } }))).rejects.toThrow("评论读取权限");
  await expect(readIssue(url, async (input) => new Response(JSON.stringify(input.includes("/comment?")
    ? { startAt: 0, total: 1, comments: [] } : issue), { headers: { "content-type": "application/json" } }))).rejects.toThrow("分页内容发生变化");
});
test("browser import refuses mismatched issues and keeps only title and description", () => {
  const document = importIssueJson("https://planetart.atlassian.net/browse/WEB-128110", JSON.stringify(issue));
  expect(document.key).toBe("WEB-128110");
  expect(importIssueJson("https://planetart.atlassian.net/browse/WEB-128110", "Line wrap\n1" + JSON.stringify(issue)).key).toBe("WEB-128110");
  expect(() => importIssueJson("https://planetart.atlassian.net/browse/WEB-1", JSON.stringify(issue))).toThrow("编号与链接不一致");
  expect(() => importIssueJson("https://planetart.atlassian.net/browse/WEB-128110", "<html>Login</html>")).toThrow("不是 Jira JSON");
});
