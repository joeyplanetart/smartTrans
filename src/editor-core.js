(function (root) {
  function detectLanguage(text) {
    const content = text.replace(/https?:\/\/\S+|`[^`]*`/g, "");
    const chinese = (content.match(/[\u3400-\u9fff]/g) || []).length;
    const english = (content.match(/[a-zA-Z]+/g) || []).length;
    // Count English words rather than letters so a short technical term does
    // not overwhelm a Chinese sentence.
    if (!chinese && !english) return { source: "自动识别", target: "en" };
    const source = chinese >= english ? "中文" : "英语";
    return { source: chinese && english ? source + "为主 · 混排" : source, target: chinese >= english ? "en" : "zh" };
  }
  class History {
    constructor(initial) { this.entries = [initial]; this.index = 0; this.group = null; }
    current() { return this.entries[this.index]; }
    selection(start, end) { Object.assign(this.current(), { start, end }); }
    record(state, group = null, now = Date.now()) {
      if (state.value === this.current().value) { this.selection(state.start, state.end); return; }
      this.entries.length = this.index + 1;
      if (group && group === this.group && now - this.lastTime < 700 && this.index > 0) {
        this.entries[this.index] = state;
      } else {
        this.entries.push(state);
        this.index++;
        if (this.entries.length > 100) { this.entries.shift(); this.index--; }
      }
      this.group = group;
      this.lastTime = now;
    }
    undo() { this.group = null; return this.index > 0 ? this.entries[--this.index] : null; }
    redo() { this.group = null; return this.index + 1 < this.entries.length ? this.entries[++this.index] : null; }
  }
  const api = { detectLanguage, History };
  if (typeof module !== "undefined") module.exports = api;
  else root.EditorCore = api;
})(typeof window === "undefined" ? globalThis : window);
