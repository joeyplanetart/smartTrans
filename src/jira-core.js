(function (root) {
  function batches(blocks, nonce, limit = 6000) {
    while (blocks.some((block) => block.markdown.includes("`SMARTTRANS_JIRA_" + nonce + "_"))) nonce += "X";
    const groups = [];
    let group = { text: "", rows: [] };
    for (const [index, block] of blocks.entries()) {
      const marker = "`SMARTTRANS_JIRA_" + nonce + "_" + index + "`";
      const part = marker + "\n\n" + block.markdown;
      if (part.length > 19500) throw new Error("有一段 Jira 内容超过单次翻译上限，请缩短该段后使用文本翻译。");
      if (group.rows.length && group.text.length + part.length + 2 > limit) {
        groups.push(group);
        group = { text: "", rows: [] };
      }
      group.text += (group.text ? "\n\n" : "") + part;
      group.rows.push({ id: block.id, marker });
    }
    if (group.rows.length) groups.push(group);
    return groups;
  }
  function splitTranslation(text, group, partial = false) {
    const firstMarker = text.indexOf(group.rows[0]?.marker);
    const prefix = firstMarker >= 0 ? text.slice(0, firstMarker) : "";
    const wrapper = prefix.match(/(?:^|\n)\s*(`{3,}|~{3,})\w*\s*$/);
    if (firstMarker >= 0) text = text.slice(firstMarker);
    if (wrapper) {
      const ending = new RegExp("\\r?\\n" + wrapper[1] + "\\s*$");
      text = text.replace(ending, "");
    }
    const found = [];
    let previous = -1;
    for (const row of group.rows) {
      const position = text.indexOf(row.marker);
      if (position === -1) {
        if (partial) break;
        throw new Error("译文段落未能与 Jira 原文对齐，请重试。");
      }
      if (position <= previous || text.indexOf(row.marker, position + row.marker.length) !== -1) throw new Error("译文段落顺序校验失败，请重试。");
      found.push({ ...row, position });
      previous = position;
    }
    return found.map((row, index) => ({
      id: row.id, text: text.slice(row.position + row.marker.length, found[index + 1]?.position ?? text.length).trim(),
    }));
  }
  const api = { batches, splitTranslation };
  if (typeof module !== "undefined") module.exports = api;
  else root.JiraCore = api;
})(typeof window === "undefined" ? globalThis : window);
