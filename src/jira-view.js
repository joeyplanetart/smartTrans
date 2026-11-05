(() => {
  const $ = (selector) => document.querySelector(selector);
  let active = false;
  let issue = null;
  let importing = false;
  let operation = null;
  let completed = false;
  const cells = new Map();
  const translations = new Map();
  $("#jiraUrl").value = localStorage.getItem("smart-trans-jira-url") || "";
  $("#jiraUrl").addEventListener("input", () => localStorage.setItem("smart-trans-jira-url", $("#jiraUrl").value));

  function status(message, error = false) {
    const element = $(error ? "#jiraError" : "#jiraState");
    element.textContent = message;
    element.classList.toggle("hidden", !message);
  }
  function busy() { return importing || Boolean(operation); }
  function mode(value) {
    if (busy() || window.TextTranslation.isBusy()) {
      status("请先等待当前操作完成，或取消正在进行的翻译。", true);
      return;
    }
    active = value;
    localStorage.setItem("smart-trans-mode", value ? "jira" : "text");
    $("#textWorkspace").classList.toggle("hidden", value);
    $("#jiraWorkspace").classList.toggle("hidden", !value);
    $("#textModeButton").classList.toggle("active", !value);
    $("#jiraModeButton").classList.toggle("active", value);
    $(".main").classList.toggle("jira-mode", value);
    $(".intro").classList.toggle("hidden", value);
    $(".footer-tips").classList.toggle("hidden", value);
    if (value) $("#jiraUrl").focus();
  }
  function controls() {
    $("#jiraLoadButton").disabled = busy();
    $("#jiraUrl").disabled = busy();
    $("#jiraTranslateButton").disabled = busy() || !issue;
    $("#jiraTarget").disabled = busy();
    $("#provider").disabled = Boolean(operation);
    $("#jiraCopyButton").disabled = !completed || Boolean(operation);
    $("#jiraCancelButton").classList.toggle("hidden", !operation);
    $("#jiraBrowserButton").disabled = busy();
    $("#jiraImportClipboardButton").disabled = busy();
    $("#jiraMoreCommentsButton").classList.toggle("hidden", !issue || issue.commentsComplete);
    $("#jiraMoreCommentsButton").disabled = busy();
    $("#jiraMoreCommentsButton").textContent = issue?.comments?.length ? "导入更多评论 ↗" : "导入评论 ↗";
    $("#jiraCopyButton").textContent = issue?.commentsComplete ? "复制完整译文" : "复制当前译文";
  }
  function acceptIssue(value) {
    issue = value;
    $("#jiraUrl").value = issue.url;
    localStorage.setItem("smart-trans-jira-url", issue.url);
    renderIssue();
  }
  function renderIssue() {
    cells.clear();
    translations.clear();
    completed = false;
    $("#jiraRows").replaceChildren();
    $("#jiraKey").textContent = issue.key;
    const loadedComments = issue.comments?.length || 0;
    const commentCount = issue.commentsTotal == null ? "评论尚未导入" : "评论 " + loadedComments + "/" + issue.commentsTotal + " 条";
    $("#jiraMeta").textContent = [issue.issueType, issue.status, commentCount].filter(Boolean).join(" · ");
    const warnings = [...issue.warnings];
    if (issue.emptyDescription) warnings.push("该票据暂无描述。");
    if (!issue.commentsComplete) warnings.push("评论尚未完整导入。点击「导入更多评论」或「导入评论」，复制打开的数据页后再次导入。");
    $("#jiraWarning").textContent = warnings.join(" ");
    $("#jiraWarning").classList.toggle("hidden", !warnings.length);
    let commentSection = false;
    const date = (value) => {
      if (!value) return "时间未提供";
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
    };
    for (const block of issue.blocks) {
      if (block.comment) {
        if (!commentSection) {
          const heading = document.createElement("div");
          heading.className = "comment-divider";
          heading.textContent = "评论 · 按发布时间排序";
          $("#jiraRows").append(heading);
          commentSection = true;
        }
        const meta = document.createElement("div");
        meta.className = "comment-meta";
        meta.textContent = block.comment.author + " · " + date(block.comment.created) +
          (block.comment.updated && block.comment.updated !== block.comment.created ? " · 编辑于 " + date(block.comment.updated) : "");
        $("#jiraRows").append(meta);
      }
      const row = document.createElement("div");
      row.className = "comparison-row";
      const source = document.createElement("article");
      source.className = "markdown-body source-cell";
      source.innerHTML = block.empty ? "该评论没有文字内容。" : MarkdownView.render(block.markdown);
      const target = document.createElement("article");
      target.className = "markdown-body target-cell pending-cell";
      target.textContent = block.empty ? "该评论没有文字内容。" : "等待翻译…";
      row.append(source, target);
      $("#jiraRows").append(row);
      cells.set(block.id, target);
    }
    if (issue.commentsComplete && !loadedComments) {
      const empty = document.createElement("div");
      empty.className = "comment-divider";
      empty.textContent = "评论 · 当前账号没有可见评论";
      $("#jiraRows").append(empty);
    }
    $("#jiraDocument").classList.remove("hidden");
    $("#jiraEmpty").classList.add("hidden");
    $("#jiraComparison").scrollTop = 0;
    controls();
  }
  async function load() {
    if (busy() || window.TextTranslation.isBusy()) return;
    const url = $("#jiraUrl").value.trim();
    if (!url) { status("请先粘贴 Jira 票据链接。", true); return; }
    importing = true;
    controls();
    status("", true);
    status("正在读取 Jira 标题、描述和评论…");
    let loaded = false;
    try {
      const response = await window.smartTrans.readJira(url);
      if (!response.ok) {
        status(response.error, true);
        status(response.code === "AUTH_REQUIRED" ? "点击「连接 Jira」配置 API Token；不使用 Token 时，可选择「浏览器导入」。" : "");
        return;
      }
      acceptIssue(response.issue);
      loaded = true;
    } catch { status("读取失败，请检查网络后重试。", true); }
    finally { importing = false; controls(); }
    if (loaded) await translate();
  }
  function applyParts(text, group, partial) {
    for (const part of JiraCore.splitTranslation(text, group, partial)) {
      const cell = cells.get(part.id);
      if (!cell) continue;
      cell.classList.remove("pending-cell");
      cell.innerHTML = MarkdownView.render(part.text);
      cell.dataset.state = partial ? "streaming" : "complete";
      if (!partial) translations.set(part.id, part.text);
    }
  }
  async function translate() {
    if (!issue || busy() || window.TextTranslation.isBusy()) return;
    const target = $("#jiraTarget").value;
    let groups;
    try { groups = JiraCore.batches(issue.blocks.filter((block) => !block.empty), issue.key.replace(/[^a-z0-9]/gi, "_")); }
    catch (error) { status(error.message, true); return; }
    status("", true);
    translations.clear();
    completed = false;
    for (const block of issue.blocks) {
      const cell = cells.get(block.id);
      if (block.empty) { translations.set(block.id, ""); continue; }
      cell.textContent = "等待翻译…";
      cell.classList.add("pending-cell");
      cell.dataset.state = "pending";
    }
    const task = { cancelled: false, requestId: null, group: null, phase: "启动引擎", started: performance.now() };
    operation = task;
    $("#jiraTranslationHeading").textContent = target === "zh" ? "中文译文" : "英语译文";
    controls();
    let index = 0;
    const tick = () => status((task.cancelled ? "正在取消" : task.phase) + " · " + Math.min(index + 1, groups.length) + "/" + groups.length +
      " 组 · " + ((performance.now() - task.started) / 1000).toFixed(1) + " 秒");
    tick();
    const timer = setInterval(tick, 100);
    try {
      for (const group of groups) {
        if (task.cancelled) break;
        task.group = group;
        task.requestId = crypto.randomUUID();
        task.phase = "启动引擎";
        const response = await window.smartTrans.translate({
          requestId: task.requestId, text: group.text, target, provider: $("#provider").value, format: "jira",
        });
        if (task.cancelled) break;
        if (!response.ok) throw new Error(response.error);
        applyParts(response.translation, group, false);
        index++;
      }
      if (!task.cancelled) {
        completed = true;
        status("当前内容翻译完成 · " + (issue.comments?.length || 0) + " 条评论 · " +
          (issue.commentsComplete ? "" : "评论尚未完整导入 · ") +
          "总耗时 " + ((performance.now() - task.started) / 1000).toFixed(1) + " 秒");
      }
    } catch (error) { status(error.message || "翻译失败，请重试。", true); status("翻译未完成，原文已保留。"); }
    finally {
      clearInterval(timer);
      for (const [id, cell] of cells) {
        if (!translations.has(id)) {
          cell.textContent = task.cancelled ? "已取消，原文保留。可重新翻译。" : "该段未完成，请重试。";
          cell.classList.add("pending-cell");
          cell.dataset.state = "pending";
        }
      }
      operation = null;
      if (task.cancelled) status("已取消；原文和已完成校验的段落已保留。");
      controls();
    }
  }
  function cancel() {
    if (!operation || operation.cancelled) return;
    operation.cancelled = true;
    if (operation.requestId) window.smartTrans.cancel(operation.requestId);
  }
  window.smartTrans.onProgress((event) => {
    const task = operation;
    if (!task || task.cancelled || task.requestId !== event.requestId) return;
    if (event.type === "ready") task.phase = "等待首字";
    if (event.type === "text") {
      task.phase = "正在生成";
      try { applyParts(event.text, task.group, true); } catch {}
    }
  });
  $("#jiraLoadButton").addEventListener("click", load);
  $("#jiraTranslateButton").addEventListener("click", translate);
  $("#jiraCancelButton").addEventListener("click", cancel);
  $("#jiraUrl").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); load(); }
  });
  $("#jiraLoginButton").addEventListener("click", async () => {
    if (busy()) return;
    const response = await window.smartTrans.jiraConnectionStatus($("#jiraUrl").value.trim());
    if (!response.ok) { status(response.error, true); return; }
    $("#jiraEmail").value = response.email;
    $("#jiraToken").value = "";
    $("#jiraTokenKind").value = response.kind;
    $("#jiraCloudId").value = response.cloudId;
    $("#jiraRemember").checked = false;
    $("#jiraConnectionStatus").textContent = response.connected ? "已连接。为保护 Token，不会在此回填；可直接关闭设置并读取票据。" : "默认仅在本次运行中保留 Token。";
    $("#jiraConnectionDialog").showModal();
  });
  $("#jiraConnectionClose").addEventListener("click", () => $("#jiraConnectionDialog").close());
  $("#jiraCreateToken").addEventListener("click", () => window.smartTrans.openExternal("https://id.atlassian.com/manage-profile/security/api-tokens"));
  $("#jiraDisconnect").addEventListener("click", async () => {
    const response = await window.smartTrans.disconnectJira($("#jiraUrl").value.trim());
    $("#jiraToken").value = "";
    $("#jiraConnectionStatus").textContent = response.ok ? "连接已移除。" : response.error;
  });
  $("#jiraConnectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy()) return;
    importing = true;
    controls();
    $("#jiraConnectSubmit").disabled = true;
    $("#jiraConnectionClose").disabled = true;
    $("#jiraConnectionStatus").textContent = "正在验证连接并读取票据…";
    let loaded = false;
    try {
      const response = await window.smartTrans.connectJira({
        url: $("#jiraUrl").value.trim(), email: $("#jiraEmail").value, token: $("#jiraToken").value,
        kind: $("#jiraTokenKind").value, cloudId: $("#jiraCloudId").value, remember: $("#jiraRemember").checked,
      });
      if (!response.ok) { $("#jiraConnectionStatus").textContent = response.error; return; }
      $("#jiraToken").value = "";
      $("#jiraConnectionDialog").close();
      status("", true);
      acceptIssue(response.issue);
      loaded = true;
    } catch { $("#jiraConnectionStatus").textContent = "连接失败，请检查网络后重试。"; }
    finally {
      importing = false;
      $("#jiraConnectSubmit").disabled = false;
      $("#jiraConnectionClose").disabled = false;
      controls();
    }
    if (loaded) translate();
  });
  $("#jiraConnectionDialog").addEventListener("cancel", (event) => { if (importing) event.preventDefault(); });
  $("#jiraBrowserButton").addEventListener("click", async () => {
    if (busy()) return;
    const response = await window.smartTrans.jiraBrowserData($("#jiraUrl").value.trim());
    if (!response.ok) { status(response.error, true); return; }
    status("", true);
    status("已在默认浏览器打开票据数据。全选并复制 JSON 后，回到这里点击「导入剪贴板数据」。若被 JSON 插件折叠，可按 ⌘⌥U 查看源代码后复制。");
  });
  $("#jiraMoreCommentsButton").addEventListener("click", async () => {
    if (busy() || !issue) return;
    const response = await window.smartTrans.jiraBrowserComments(issue.url);
    if (!response.ok) { status(response.error, true); return; }
    status("", true);
    status("已打开下一页评论数据。请全选并复制 JSON，然后点击「导入剪贴板数据」。可用 ⌘⌥U 查看源代码后复制。");
  });
  $("#jiraImportClipboardButton").addEventListener("click", async () => {
    if (busy()) return;
    const response = await window.smartTrans.importJiraClipboard($("#jiraUrl").value.trim());
    if (!response.ok) { status(response.error, true); return; }
    status("", true);
    acceptIssue(response.issue);
    translate();
  });
  $("#jiraOpenButton").addEventListener("click", () => { if (issue) window.smartTrans.openExternal(issue.url); });
  $("#jiraCopyButton").addEventListener("click", async () => {
    if (!completed) return;
    await window.smartTrans.copy(issue.blocks.map((block) => {
      const text = translations.get(block.id);
      return block.comment ? "### 评论 · " + block.comment.author + " · " + block.comment.created + "\n\n" + text : text;
    }).join("\n\n"));
    $("#jiraCopyButton").textContent = "已复制";
    setTimeout(() => { $("#jiraCopyButton").textContent = issue?.commentsComplete ? "复制完整译文" : "复制当前译文"; }, 1500);
  });
  $("#jiraWorkspace").addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    event.preventDefault();
    window.smartTrans.openExternal(link.getAttribute("href"));
  });
  $("#textModeButton").addEventListener("click", () => mode(false));
  $("#jiraModeButton").addEventListener("click", () => mode(true));
  window.JiraView = {
    isActive: () => active, isBusy: () => busy() || $("#jiraConnectionDialog").open, translate, cancel,
    close: () => mode(false),
    open: () => mode(true),
    notifyBusy: () => status("请先取消或等待 Jira 翻译完成。", true),
    editorCommand(command) {
      if (document.activeElement?.matches("input,textarea")) document.execCommand(command);
    },
  };
  if (localStorage.getItem("smart-trans-mode") === "jira") mode(true);
})();
