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
    $("#jiraMeta").textContent = [issue.issueType, issue.status].filter(Boolean).join(" · ");
    const warnings = [...issue.warnings];
    if (issue.emptyDescription) warnings.push("该票据暂无描述，仅翻译标题。");
    $("#jiraWarning").textContent = warnings.join(" ");
    $("#jiraWarning").classList.toggle("hidden", !warnings.length);
    for (const block of issue.blocks) {
      const row = document.createElement("div");
      row.className = "comparison-row";
      const source = document.createElement("article");
      source.className = "markdown-body source-cell";
      source.innerHTML = MarkdownView.render(block.markdown);
      const target = document.createElement("article");
      target.className = "markdown-body target-cell pending-cell";
      target.textContent = "等待翻译…";
      row.append(source, target);
      $("#jiraRows").append(row);
      cells.set(block.id, target);
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
    status("正在读取 Jira 标题和描述…");
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
    try { groups = JiraCore.batches(issue.blocks, issue.key.replace(/[^a-z0-9]/gi, "_")); }
    catch (error) { status(error.message, true); return; }
    status("", true);
    translations.clear();
    completed = false;
    for (const cell of cells.values()) {
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
        status("翻译完成 · " + issue.blocks.length + " 段已对齐 · 总耗时 " + ((performance.now() - task.started) / 1000).toFixed(1) + " 秒");
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
    await window.smartTrans.copy(issue.blocks.map((block) => translations.get(block.id)).join("\n\n"));
    $("#jiraCopyButton").textContent = "已复制";
    setTimeout(() => { $("#jiraCopyButton").textContent = "复制完整译文"; }, 1500);
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
    notifyBusy: () => status("请先取消或等待 Jira 翻译完成。", true),
    editorCommand(command) {
      if (document.activeElement?.matches("input,textarea")) document.execCommand(command);
    },
  };
  if (localStorage.getItem("smart-trans-mode") === "jira") mode(true);
})();
