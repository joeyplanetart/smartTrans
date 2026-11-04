function parseJiraUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new Error("请输入完整的 Jira 链接。"); }
  const match = url.pathname.match(/^\/browse\/([A-Z][A-Z0-9_]*-\d+)\/?$/i);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.atlassian\.net$/i.test(url.hostname) ||
      url.port || url.username || url.password || !match) {
    throw new Error("目前支持 https://站点.atlassian.net/browse/项目编号 格式的 Jira Cloud 链接。");
  }
  const key = match[1].toUpperCase();
  return { origin: url.origin, key, url: url.origin + "/browse/" + key };
}
function safeUrl(input) {
  try {
    const url = new URL(input);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
const escapeText = (text) => String(text || "").replace(/[\\`*_{}\[\]<>|]/g, "\\$&");
const code = (text) => {
  const longest = Math.max(0, ...((text || "").match(/`+/g) || []).map((s) => s.length));
  const fence = "`".repeat(longest + 1);
  return fence + " " + text + " " + fence;
};
function adfMarkdown(node, warnings = new Set()) {
  if (!node) return "";
  if (typeof node === "string") return node;
  const children = (separator = "") => (node.content || []).map((child) => adfMarkdown(child, warnings)).join(separator);
  switch (node.type) {
    case "text": {
      let value = escapeText(node.text);
      for (const mark of node.marks || []) {
        if (mark.type === "code") value = code(node.text || "");
        if (mark.type === "strong") value = "**" + value + "**";
        if (mark.type === "em") value = "_" + value + "_";
        if (mark.type === "strike") value = "~~" + value + "~~";
        if (mark.type === "link") {
          const url = safeUrl(mark.attrs?.href);
          if (url) value = "[" + value + "](" + url.replace(/\(/g, "%28").replace(/\)/g, "%29") + ")";
        }
      }
      return value;
    }
    case "doc": return children("\n\n");
    case "paragraph": return children();
    case "heading": return "#".repeat(Math.min(6, Math.max(1, node.attrs?.level || 2))) + " " + children();
    case "hardBreak": return "  \n";
    case "bulletList":
    case "orderedList":
      return (node.content || []).map((item, index) => {
        const marker = node.type === "orderedList" ? String((node.attrs?.order || 1) + index) + ". " : "- ";
        return marker + adfMarkdown(item, warnings).replace(/\n/g, "\n" + " ".repeat(marker.length));
      }).join("\n");
    case "listItem": return children("\n");
    case "blockquote": return children("\n\n").split("\n").map((line) => "> " + line).join("\n");
    case "codeBlock": {
      const value = (node.content || []).map((item) => item.text || "").join("");
      const fence = "`".repeat(Math.max(3, ...((value.match(/`+/g) || []).map((s) => s.length + 1))));
      return fence + String(node.attrs?.language || "").replace(/[^a-z0-9+#.-]/gi, "") + "\n" + value + "\n" + fence;
    }
    case "rule": return "---";
    case "table": {
      const rows = (node.content || []).map((row) => (row.content || []).map((cell) =>
        (cell.content || []).map((item) => adfMarkdown(item, warnings)).join(" / ").replace(/\n/g, " / ")));
      const width = Math.max(0, ...rows.map((row) => row.length));
      if (!width) return "";
      const render = (row) => "| " + Array.from({ length: width }, (_, i) => row[i] || "").join(" | ") + " |";
      return [render(rows[0]), render(Array(width).fill("---")), ...rows.slice(1).map(render)].join("\n");
    }
    case "mention": return escapeText(node.attrs?.text || "@mention");
    case "emoji": return escapeText(node.attrs?.text || node.attrs?.shortName || "");
    case "status": return escapeText(node.attrs?.text || "");
    case "date": {
      const value = new Date(Number(node.attrs?.timestamp));
      return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
    }
    case "inlineCard":
    case "blockCard": return safeUrl(node.attrs?.url) || "";
    case "media":
    case "mediaInline":
      warnings.add("图片和附件不进行 OCR 翻译，请在 Jira 原页查看。");
      return node.attrs?.alt ? escapeText(node.attrs.alt) : code("Jira media");
    case "panel":
    case "expand":
    case "nestedExpand": return (node.attrs?.title ? "### " + escapeText(node.attrs.title) + "\n\n" : "") + children("\n\n");
    default:
      if (node.type && !["mediaSingle", "mediaGroup", "tableCell", "tableHeader", "tableRow"].includes(node.type)) {
        warnings.add("部分 Jira 扩展内容已按文字展示，请结合原页核对。");
      }
      return children("\n\n");
  }
}
function issueDocument(issue, location) {
  if (!issue?.fields || typeof issue.fields.summary !== "string") throw new Error("Jira 返回了无效的票据内容。");
  const warnings = new Set();
  if ((issue.fields.description?.content?.length || 0) > 500) throw new Error("票据描述段落过多，请在 Jira 原页查看。");
  const blocks = [{ id: "summary", markdown: "# " + escapeText(issue.fields.summary) }];
  const description = issue.fields.description;
  if (typeof description === "string" && description.trim()) blocks.push({ id: "description", markdown: description });
  else for (const [index, node] of (description?.content || []).entries()) {
    const markdown = adfMarkdown(node, warnings);
    if (markdown.trim()) blocks.push({ id: "description-" + index, markdown });
  }
  const document = {
    key: issue.key || location.key, issueId: String(issue.id || ""), url: location.url,
    status: issue.fields.status?.name || "", issueType: issue.fields.issuetype?.name || "",
    updated: issue.fields.updated || "", blocks, warnings: [...warnings],
    emptyDescription: blocks.length === 1,
    comments: [], commentsTotal: null, commentsComplete: false, commentsNextStartAt: 0,
  };
  return issue.fields.comment ? appendComments(document, issue.fields.comment) : document;
}

function issueApiUrl(input) {
  const location = parseJiraUrl(input);
  return location.origin + "/rest/api/3/issue/" + location.key + "?fields=summary,description,status,issuetype,updated,comment&updateHistory=false";
}
function commentsApiUrl(input, startAt = 0) {
  const location = parseJiraUrl(input);
  if (!Number.isInteger(startAt) || startAt < 0 || startAt > 5000) throw new Error("评论分页位置无效。");
  return location.origin + "/rest/api/3/issue/" + location.key + "/comment?startAt=" + startAt + "&maxResults=100&orderBy=created";
}
function commentPage(page) {
  if (!Array.isArray(page?.comments)) throw new Error("Jira 评论数据无效。");
  const startAt = page.startAt ?? 0;
  const total = page.total ?? page.comments.length;
  if (!Number.isInteger(startAt) || !Number.isInteger(total) || startAt < 0 || total < 0 || total > 5000) throw new Error("评论数量过多或分页信息无效，无法一次读取。");
  if (!page.comments.length && startAt < total) throw new Error("评论分页内容发生变化，请重新读取票据。");
  return { startAt, total, comments: page.comments };
}
function appendComments(document, rawPage, verifyOrigin = false) {
  const page = commentPage(rawPage);
  if (page.startAt !== (document.commentsNextStartAt ?? 0)) throw new Error("评论页不连续或已经导入，请打开提示的下一页评论。");
  const warnings = new Set(document.warnings);
  const values = new Map((document.comments || []).map((comment) => [comment.id, comment]));
  for (const comment of page.comments) {
    if (!comment?.id) throw new Error("评论缺少编号，无法对齐。");
    if (verifyOrigin) {
      let self;
      try { self = new URL(comment.self); } catch { throw new Error("无法确认评论所属票据，请重新复制指定的评论数据页。"); }
      const identifier = self.pathname.match(/\/issue\/([^/]+)\/comment\//)?.[1];
      if (self.origin !== new URL(document.url).origin || ![document.key, document.issueId].filter(Boolean).includes(identifier)) {
        throw new Error("剪贴板评论不属于当前票据，请重新复制。");
      }
    }
    const markdown = adfMarkdown(comment.body, warnings);
    values.set(String(comment.id), {
      id: String(comment.id), author: String(comment.author?.displayName || "未知作者"),
      created: String(comment.created || ""), updated: String(comment.updated || ""), markdown,
    });
  }
  const comments = [...values.values()].sort((a, b) =>
    (Date.parse(a.created) || 0) - (Date.parse(b.created) || 0) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const next = page.startAt + page.comments.length;
  const complete = next >= page.total && comments.length >= page.total;
  if (next >= page.total && !complete) throw new Error("评论列表发生变化或数据重复，未能完整导入，请重新读取票据。");
  const blocks = [
    ...document.blocks.filter((block) => !block.comment),
    ...comments.map((comment) => ({
      id: "comment-" + comment.id, markdown: comment.markdown, empty: !comment.markdown.trim(),
      comment: { id: comment.id, author: comment.author, created: comment.created, updated: comment.updated },
    })),
  ];
  return { ...document, blocks, warnings: [...warnings], comments,
    commentsTotal: page.total, commentsComplete: complete, commentsNextStartAt: complete ? null : next };
}
function validateConnection(input) {
  const email = String(input.email || "").trim();
  const token = String(input.token || "").trim();
  const kind = input.kind === "classic" ? "classic" : "scoped";
  const cloudId = String(input.cloudId || "").trim();
  if (!/^[^\s:@]+@[^\s@]+\.[^\s@]+$/.test(email) || !token || token.length > 10000) throw new Error("请填写有效的 Atlassian 邮箱和 API Token。");
  if (cloudId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(cloudId)) throw new Error("Cloud ID 格式不正确。");
  return { email, token, kind, cloudId };
}
async function resolveConnection(input, connection, fetcher) {
  const value = validateConnection(connection);
  if (value.kind === "scoped" && !value.cloudId) {
    const location = parseJiraUrl(input);
    const response = await fetcher(location.origin + "/_edge/tenant_info", {
      method: "GET", redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("无法自动读取 Cloud ID，请在连接设置中手动填写。");
    let metadata;
    try { metadata = await response.json(); } catch { throw new Error("无法自动读取 Cloud ID，请手动填写。"); }
    value.cloudId = metadata.cloudId;
    return validateConnection(value);
  }
  return value;
}
function importIssueJson(input, raw, existingDocument = null) {
  const location = parseJiraUrl(input);
  if (typeof raw !== "string" || raw.length > 2000000) throw new Error("剪贴板数据过大或不是文字。");
  let issue;
  // Chrome's source viewer can copy a "Line wrap" label and line number before JSON.
  const first = raw.indexOf("{"), last = raw.lastIndexOf("}");
  try { issue = JSON.parse(first >= 0 && last >= first ? raw.slice(first, last + 1) : raw); }
  catch { throw new Error("剪贴板不是 Jira JSON 数据。请在浏览器票据数据页全选、复制后再导入。"); }
  if (Array.isArray(issue.comments) && !issue.fields) {
    if (!existingDocument || existingDocument.key !== location.key || existingDocument.url !== location.url) throw new Error("请先导入当前票据的标题和描述，再导入评论页。");
    return appendComments(existingDocument, issue, true);
  }
  if (String(issue.key).toUpperCase() !== location.key) throw new Error("剪贴板中的票据编号与链接不一致，请重新复制对应票据的数据。");
  return issueDocument(issue, location);
}
async function readIssue(input, fetcher, connection) {
  const location = parseJiraUrl(input);
  let base = location.origin;
  const headers = { Accept: "application/json" };
  if (connection) {
    connection = validateConnection(connection);
    if (connection.kind === "scoped") {
      if (!connection.cloudId) throw new Error("请先在连接设置中读取 Cloud ID。");
      base = "https://api.atlassian.com/ex/jira/" + connection.cloudId;
    }
    headers.Authorization = "Basic " + Buffer.from(connection.email + ":" + connection.token).toString("base64");
  }
  async function request(path) {
    return fetcher(base + path, {
      method: "GET", headers,
      credentials: "omit", redirect: "manual", signal: AbortSignal.timeout(30000),
    });
  }
  let response;
  try { response = await request("/rest/api/3/issue/" + location.key + "?fields=summary,description,status,issuetype,updated&updateHistory=false"); }
  catch { throw new Error("无法连接 Jira，请检查网络后重试。"); }
  if (response.status === 429) throw new Error("Jira 请求过于频繁，请稍后重试。");
  if ([401, 302, 303, 307, 308].includes(response.status) || !response.headers.get("content-type")?.includes("application/json")) {
    return { ok: false, code: "AUTH_REQUIRED", error: connection ? "API Token 无效、已过期或请求被拦截。请检查连接设置，也可以使用浏览器导入。" : "请连接 Jira API Token，或使用「浏览器导入」。浏览器登录状态不会自动共享给本应用。", url: location.url };
  }
  if (response.status === 404 || response.status === 403) {
    if (connection) throw new Error("当前 Token 缺少票据读取权限，或票据不存在。请检查权限、Token 类型和票据链接。");
    const myself = await request("/rest/api/3/myself").catch(() => null);
    if (!myself || myself.status !== 200) return { ok: false, code: "AUTH_REQUIRED", error: "请连接 Jira API Token，或使用浏览器导入。", url: location.url };
    throw new Error("票据不存在或当前账号没有查看权限。");
  }
  if (!response.ok) throw new Error(response.status === 429 ? "Jira 请求过于频繁，请稍后重试。" : "Jira 读取失败，请稍后重试。");
  const raw = await response.text();
  if (raw.length > 2000000) throw new Error("票据内容过大，请在 Jira 原页查看。");
  let issue;
  try { issue = JSON.parse(raw); } catch { throw new Error("Jira 返回内容无法解析。"); }
  const document = issueDocument({ ...issue, fields: { ...issue.fields, comment: undefined } }, location);
  const comments = new Map();
  let startAt = 0, total = 0;
  do {
    let response;
    try { response = await request("/rest/api/3/issue/" + location.key + "/comment?startAt=" + startAt + "&maxResults=100&orderBy=created"); }
    catch { throw new Error("读取评论失败，请检查网络后重试。"); }
    if (!response.ok) throw new Error(response.status === 429 ? "评论读取过于频繁，请稍后重试。" : "票据已读取，但评论读取失败。请确认 Token 包含 Jira 评论读取权限。");
    const content = await response.text();
    if (content.length > 2000000) throw new Error("单页评论内容过大，无法读取。");
    let page;
    try { page = commentPage(JSON.parse(content)); } catch (error) { throw new Error("评论读取失败：" + error.message); }
    if (page.startAt !== startAt) throw new Error("Jira 评论分页不连续，请重新读取。");
    for (const comment of page.comments) comments.set(String(comment.id), comment);
    total = page.total;
    startAt += page.comments.length;
  } while (startAt < total);
  if (comments.size < total) throw new Error("评论列表发生变化，未能完整读取，请重试。");
  return { ok: true, issue: appendComments(document, { startAt: 0, total: comments.size, comments: [...comments.values()] }) };
}
module.exports = { parseJiraUrl, safeUrl, adfMarkdown, issueDocument, readIssue, issueApiUrl, commentsApiUrl, appendComments, importIssueJson, resolveConnection, validateConnection };
