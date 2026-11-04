const { randomBytes } = require("node:crypto");

// Hide syntax from the model, then restore it only after every token is checked.
function protectMarkdown(source) {
  const prefix = "ST" + randomBytes(3).toString("hex") + "_";
  const values = [];
  const hold = (value) => {
    const token = "⟦" + prefix + values.length + "⟧";
    values.push(value);
    return token;
  };
  let fence = null;
  const parts = source.split(/(\r?\n)/);
  const masked = parts.map((line) => {
    if (/^\r?\n$/.test(line)) return hold(line);
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const result = hold(line);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return result;
    }
    if (marker) { fence = marker[1]; return hold(line); }
    // Indented code, thematic breaks, and reference definitions are opaque.
    if ((/^(?: {4}|\t)/.test(line) && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) || /^\s*(?:[-*_]\s*){3,}$/.test(line) ||
        /^\s*\[[^\]]+\]:\s*\S+/.test(line)) return hold(line);
    let output = "";
    const head = line.match(/^(\s*(?:(?:>\s*)+)?(?:(?:#{1,6}\s+)|(?:[-+*]\s+(?:\[[ xX]\]\s+)?)|(?:\d+[.)]\s+))?)/)[0];
    if (head) output = hold(head);
    const body = line.slice(head.length);
    const syntax = /(`+)[^`]*?\1|\[[^\]\n]*\]\([^\n)]*\)|https?:\/\/[^\s<>]+|\\[\\`*{}\[\]()#+.!_>-]|\*{1,3}|_{1,3}|~~|\|| {2,}$/g;
    let index = 0;
    const identifiers = /\b[A-Za-z0-9.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\b[A-Fa-f0-9]{8}-(?:[A-Fa-f0-9]{4}-){3}[A-Fa-f0-9]{12}\b|\b[A-Za-z][A-Za-z0-9]*(?:\\?_[A-Za-z0-9]+)+\b|\\[|<]/;
    const protectedSyntax = new RegExp(identifiers.source + "|" + syntax.source, "g");
    for (const match of body.matchAll(protectedSyntax)) {
      output += body.slice(index, match.index);
      const link = match[0].match(/^\[([^\]]*)\](\([^)]*\))$/);
      output += link ? hold("[") + link[1] + hold("]" + link[2]) : hold(match[0]);
      index = match.index + match[0].length;
    }
    return output + body.slice(index);
  }).join("");
  const tokenPattern = new RegExp("⟦" + prefix + "(\\d+)⟧", "g");
  function restore(text, partial = false) {
    if (!partial) {
      const ids = [...text.matchAll(tokenPattern)].map((match) => Number(match[1]));
      if (ids.length !== values.length || ids.some((id, index) => id !== index) || /[\r\n]/.test(text)) {
        throw new Error("译文的 Markdown 结构校验未通过，请重试；原文未修改。");
      }
    }
    let output = text.replace(tokenPattern, (_token, id) => values[Number(id)] ?? "");
    if (partial) {
      const incomplete = output.lastIndexOf("⟦");
      if (incomplete !== -1) output = output.slice(0, incomplete);
    }
    return output;
  }
  return { masked, restore, tokenCount: values.length };
}

// Jira formatting is best effort. Protect content, not line breaks or styling.
function protectJiraText(source) {
  const prefix = "ST" + randomBytes(3).toString("hex") + "_";
  const values = [];
  const hold = (value) => {
    values.push(value);
    return "⟦" + prefix + (values.length - 1) + "⟧";
  };
  const inline = /(`+)[^`]*?\1|https?:\/\/[^\s<>]+|\b[A-Za-z0-9.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\b[A-Fa-f0-9]{8}-(?:[A-Fa-f0-9]{4}-){3}[A-Fa-f0-9]{12}\b|\b[A-Za-z][A-Za-z0-9]*(?:\\?_[A-Za-z0-9]+)+\b|\\[|<]/g;
  let fence = null, codeLines = [], masked = "";
  for (const line of source.split(/(?<=\n)/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      codeLines.push(line);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) {
        masked += hold(codeLines.join(""));
        codeLines = [];
        fence = null;
      }
    } else if (marker) { fence = marker[1]; codeLines = [line]; }
    else masked += line.replace(inline, (value) => hold(value));
  }
  if (codeLines.length) masked += hold(codeLines.join(""));
  const tokens = new RegExp("⟦" + prefix + "(\\d+)⟧", "g");
  function restore(text, partial = false) {
    if (!partial) {
      const ids = [...text.matchAll(tokens)].map((match) => Number(match[1]));
      if (ids.length !== values.length || values.some((_value, id) => ids.filter((value) => value === id).length !== 1)) {
        throw new Error("译文缺少关键内容（链接、代码或字段名），请重试；原文已保留。");
      }
    }
    let output = text.replace(tokens, (_token, id) => values[Number(id)] ?? "");
    if (partial && output.includes("⟦")) output = output.slice(0, output.lastIndexOf("⟦"));
    return output;
  }
  return { masked, restore, tokenCount: values.length };
}
module.exports = { protectMarkdown, protectJiraText };
