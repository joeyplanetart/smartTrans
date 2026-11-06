(() => {
  const $ = id => document.getElementById(id);
  const key = "smart-trans-learning-v1";
  let progress;
  try { progress = LearningCore.normalize(JSON.parse(localStorage.getItem(key))); }
  catch { progress = LearningCore.emptyProgress(); }
  let active = false, wordGroup = 0, translationTimer, translationRequest, translationWork = Promise.resolve(), translationGeneration = 0, assistBusy = false;
  const save = () => localStorage.setItem(key, JSON.stringify(progress));
  const today = () => LearningCore.day(progress.selectedDay);
  const dayState = () => {
    const state = progress.days[progress.selectedDay] ||= { words: [], tasks: [], grammar: false, reading: false, writing: "", completed: false };
    if (!Array.isArray(state.words)) state.words = [];
    if (!Array.isArray(state.tasks)) state.tasks = [];
    // Existing learners keep their first completed grammar question after the expansion.
    if (!Array.isArray(state.grammarAnswers)) state.grammarAnswers = state.grammar ? [0] : [];
    return state;
  };
  const mastered = (d, state) => d.words.filter(([english]) => state.words.includes(english)).length;
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  function button(label, action, className = "secondary-button") {
    const el = node("button", className, label);
    el.type = "button"; el.addEventListener("click", action); return el;
  }
  function setMode(value) {
    if (value && (window.JiraView?.isBusy() || window.TextTranslation?.isBusy())) return;
    if (value && window.JiraView?.isActive()) window.JiraView.close();
    active = value;
    $("learningWorkspace").classList.toggle("hidden", !value);
    $("textWorkspace").classList.toggle("hidden", value);
    $("jiraWorkspace").classList.add("hidden");
    $("learningModeButton").classList.toggle("active", value);
    $("textModeButton").classList.toggle("active", !value);
    $("jiraModeButton").classList.remove("active");
    document.querySelector(".main").classList.toggle("learning-mode", value);
    document.querySelector(".intro").classList.toggle("hidden", value);
    document.querySelector(".speech-toolbar").classList.toggle("hidden", value);
    document.querySelector(".footer-tips").classList.toggle("hidden", value);
    if (value) { localStorage.setItem("smart-trans-mode", "learning"); render(); }
    else if (localStorage.getItem("smart-trans-mode") === "learning") localStorage.setItem("smart-trans-mode", "text");
  }
  function stats() {
    const completed = LearningCore.completedCount(progress);
    $("learningCompleted").textContent = completed;
    $("learningProgress").textContent = Math.round(completed / 20 * 100) + "%";
    $("learningProgressBar").style.width = completed / 20 * 100 + "%";
    $("learningReviewCount").textContent = Object.keys(progress.mistakes).length;
    $("learningMinutes").textContent = progress.minutes;
    $("learningWords").textContent = Array.from({ length: 20 }, (_, index) => {
      const state = progress.days[index];
      return state ? mastered(LearningCore.day(index), state) : 0;
    }).reduce((sum, value) => sum + value, 0);
  }
  function renderPlan(d, state) {
    $("learningDayTitle").textContent = `第 ${d.index + 1} 天 · ${d.title}`;
    $("learningDayIntro").textContent = d.goal;
    $("learningDayIndex").textContent = `${d.index + 1} / 20`;
    $("learningPrev").disabled = d.index === 0;
    $("learningNext").disabled = d.index === 19;
    const items = [
      [`掌握 ${mastered(d, state)}/30 个词`, mastered(d, state) === 30], [`完成 ${state.grammarAnswers.length}/3 道语法题`, state.grammarAnswers.length === 3],
      ["听一句并跟读", state.tasks?.includes("speaking")], ["完成阅读理解", state.reading],
      ["写 2–4 句并复盘", state.tasks?.includes("writing")]
    ];
    $("learningPlan").replaceChildren(...items.map(([label, done]) => node("span", done ? "done" : "", (done ? "✓ " : "○ ") + label)));
  }
  function renderVocab(d, state) {
    const box = $("learningVocab"); box.replaceChildren();
    const tabs = node("div", "learning-word-tabs");
    for (let group = 0; group < 3; group++) {
      tabs.append(button(`${group * 10 + 1}–${group * 10 + 10}`, () => { wordGroup = group; renderVocab(d, state); }, group === wordGroup ? "learning-word-tab active" : "learning-word-tab"));
    }
    box.append(tabs, node("p", "learning-word-progress", `已掌握 ${mastered(d, state)} / 30 个词 · 每组 10 个`));
    const cards = node("div", "learning-word-cards");
    for (const [english, chinese, example, ipa] of d.words.slice(wordGroup * 10, wordGroup * 10 + 10)) {
      const card = node("div", "learning-word");
      const line = node("div", "learning-word-head");
      const title = node("div"); title.append(node("strong", "", english), node("span", "learning-ipa", ipa), node("span", "", chinese));
      line.append(title, button("听发音", () => speak(english)));
      card.append(line);
      if (example) card.append(node("p", "", example));
      card.append(button(state.words?.includes(english) ? "已掌握 ✓" : "标记掌握", () => {
        if (!state.words.includes(english)) state.words.push(english);
        save(); render();
      }));
      cards.append(card);
    }
    box.append(cards);
    const grammar = $("learningGrammar"); grammar.replaceChildren();
    grammar.append(node("h4", "", `语法 · ${d.grammar.name}（${state.grammarAnswers.length}/3）`), node("p", "", d.grammar.tip));
    d.grammarQuestions.forEach((question, questionIndex) => {
      const item = node("div", "learning-grammar-question");
      item.append(node("strong", "", `${questionIndex + 1}. ${question.question}`));
      const options = node("div", "learning-options");
      question.options.forEach((option, index) => options.append(button(option, () => {
        const correct = index === question.answer;
        if (correct && !state.grammarAnswers.includes(questionIndex)) state.grammarAnswers.push(questionIndex);
        state.grammar = state.grammarAnswers.length === 3;
        LearningCore.recordAnswer(progress, `grammar-${d.index}-${questionIndex}`, correct, `语法 · 第 ${d.index + 1} 天第 ${questionIndex + 1} 题`, question.reason);
        save(); render();
      }, state.grammarAnswers.includes(questionIndex) && index === question.answer ? "learning-option correct" : "learning-option")));
      item.append(options, node("p", "learning-feedback", state.grammarAnswers.includes(questionIndex) ? "✓ " + question.reason : "选择答案；答错会进入复习本。"));
      grammar.append(item);
    });
  }
  function renderPractice(d, state) {
    const box = $("learningPractice"); box.replaceChildren();
    const listen = node("div", "learning-exercise");
    listen.append(node("h4", "", "听力 + 口语"), node("p", "", "先听，再跟读。对照下方句子检查自己是否能流畅读出。"),
      node("blockquote", "", d.words[0][2]), button("播放句子", () => speak(d.words[0][2])),
      button(state.tasks.includes("speaking") ? "已完成跟读 ✓" : "我已完成跟读", () => { if (!state.tasks.includes("speaking")) state.tasks.push("speaking"); save(); render(); }));
    const read = node("div", "learning-exercise");
    read.append(node("h4", "", "阅读理解"), node("p", "", d.passage), node("strong", "", d.reading));
    const choices = node("div", "learning-options");
    d.readingOptions.forEach((option, index) => choices.append(button(option, () => {
      const correct = index === d.readingAnswer;
      state.reading = state.reading || correct;
      LearningCore.recordAnswer(progress, `reading-${d.index}`, correct, "阅读 · 第 " + (d.index + 1) + " 天", `正确答案：${d.readingOptions[d.readingAnswer]}。请回到原文定位信息。`);
      save(); render();
    }, state.reading && index === d.readingAnswer ? "learning-option correct" : "learning-option")));
    read.append(choices);
    if (state.reading) read.append(node("p", "learning-feedback", "✓ 回原文找到答案所在的句子，再读一遍。"));
    const write = node("div", "learning-exercise");
    write.append(node("h4", "", "写作练习 + AI 反馈"), node("p", "", d.writing));
    const area = node("textarea", "learning-writing"); area.maxLength = 2000; area.placeholder = "Write your answer in English..."; area.value = state.writing || "";
    area.addEventListener("input", () => { state.writing = area.value; save(); });
    const output = node("div", "learning-ai-output hidden");
    write.append(area, button(state.tasks.includes("writing") ? "已保存写作 ✓" : "保存写作练习", () => {
      if (!area.value.trim()) { output.textContent = "请先写下英文句子。"; output.classList.remove("hidden"); return; }
      state.writing = area.value;
      if (!state.tasks.includes("writing")) state.tasks.push("writing");
      save(); renderPlan(d, state);
    }), button("获取 AI 修改建议", async () => {
      if (assistBusy || !area.value.trim()) { output.textContent = "请先写下英文句子。"; output.classList.remove("hidden"); return; }
      state.writing = area.value; save();
      output.textContent = "正在分析你的句子…"; output.classList.remove("hidden");
      try {
        const feedback = await assist("writing", area.value, d.writing);
        output.textContent = feedback;
        if (feedback && !state.tasks.includes("writing")) { state.tasks.push("writing"); save(); stats(); renderPlan(d, state); }
      } catch (error) { output.textContent = error.message; }
    }, "secondary-button"), output);
    const finish = button(state.completed ? "今日任务已完成 ✓" : "完成今天的学习", () => {
      const ready = mastered(d, state) === 30 && state.grammarAnswers.length === 3 && state.reading && state.tasks.includes("speaking") && state.tasks.includes("writing");
      if (!ready) { finish.textContent = "请先完成上方 5 项任务"; return; }
      if (!state.completed) { state.completed = true; progress.minutes += 35; save(); render(); }
    }, "primary-button learning-finish");
    box.append(listen, read, write, finish);
  }
  function renderSide() {
    const mistakes = $("learningMistakes"); mistakes.replaceChildren();
    const entries = Object.entries(progress.mistakes).sort((a,b) => b[1].at - a[1].at);
    if (!entries.length) mistakes.append(node("p", "learning-muted", "暂无错题，继续保持。"));
    entries.forEach(([key, item]) => {
      const row = node("div", "learning-mistake"); row.append(node("strong", "", item.topic), node("p", "", item.explanation));
      row.append(button("已复习", () => { delete progress.mistakes[key]; save(); renderSide(); stats(); }, "text-button")); mistakes.append(row);
    });
    const knowledge = $("learningKnowledge"); knowledge.replaceChildren();
    const states = Object.values(progress.days);
    const scores = { "词汇": Array.from({ length: 20 }, (_, index) => progress.days[index] ? mastered(LearningCore.day(index), progress.days[index]) : 0).reduce((a,b) => a+b, 0) / 600,
      "语法": states.reduce((n,s) => n + (s.grammarAnswers?.length || (s.grammar ? 1 : 0)), 0) / 60, "听力": states.filter(s => s.tasks?.includes("speaking")).length / 20,
      "口语": states.filter(s => s.tasks?.includes("speaking")).length / 20, "阅读": states.filter(s => s.reading).length / 20,
      "写作": states.filter(s => s.tasks?.includes("writing")).length / 20 };
    LearningCore.topics.forEach(topic => {
      const value = Math.min(100, Math.round(scores[topic] * 100));
      const row = node("div", "learning-knowledge-row");
      row.append(node("span", "", topic), node("div", "learning-knowledge-track"), node("small", "", value + "%"));
      row.children[1].append(node("span")); row.children[1].firstChild.style.width = value + "%";
      knowledge.append(row);
    });
  }
  function render() { const d = today(), state = dayState(); stats(); renderPlan(d, state); renderVocab(d, state); renderPractice(d, state); renderSide(); }
  async function speak(text) {
    const status = $("learningSpeechStatus");
    status.textContent = "准备朗读…";
    try {
      const result = await window.smartTrans.speak({ text, mode: "read", rate: Number($("speechRate").value) });
      status.textContent = result.ok ? "朗读已结束，可再次播放" : result.error || "朗读失败，请重试。";
    } catch (error) { status.textContent = error.message || "朗读失败，请重试。"; }
  }
  window.smartTrans.onSpeechState(state => {
    if (!active) return;
    $("learningSpeechStatus").textContent = state.error || (state.speaking ? "正在朗读…" : "朗读已结束，可再次播放");
  });
  async function assist(mode, text, context = "") {
    assistBusy = true; $("learningRecap").disabled = true;
    try {
      const result = await window.smartTrans.learningAssist({ requestId: crypto.randomUUID(), mode, text, context, provider: $("provider").value });
      if (!result.ok) throw new Error(result.error || "AI 暂时不可用。");
      return result.feedback;
    } finally { assistBusy = false; $("learningRecap").disabled = false; }
  }
  async function translateInput() {
    const generation = translationGeneration;
    const text = $("learningTranslateInput").value.trim();
    if (translationRequest) window.smartTrans.cancel(translationRequest);
    await translationWork.catch(() => {});
    if (generation !== translationGeneration) return;
    if (!text) { $("learningTranslateOutput").classList.add("hidden"); $("learningTranslateStatus").textContent = ""; return; }
    const requestId = crypto.randomUUID(); translationRequest = requestId;
    $("learningTranslateStatus").textContent = "翻译中…";
    try {
      translationWork = window.smartTrans.translate({ requestId, text, target: "zh", provider: $("provider").value });
      const result = await translationWork;
      if (translationRequest !== requestId) return;
      if (!result.ok) throw new Error(result.error);
      $("learningTranslateOutput").textContent = result.translation;
      $("learningTranslateOutput").classList.remove("hidden");
      $("learningTranslateStatus").textContent = "已翻译";
    } catch (error) { if (translationRequest === requestId) $("learningTranslateStatus").textContent = error.message || "翻译失败"; }
    finally { if (translationRequest === requestId) translationRequest = null; }
  }
  $("learningModeButton").addEventListener("click", () => setMode(true));
  $("textModeButton").addEventListener("click", () => setMode(false));
  $("jiraModeButton").addEventListener("click", () => {
    if (!active || !window.JiraView?.isActive()) return;
    active = false;
    $("learningWorkspace").classList.add("hidden");
    $("learningModeButton").classList.remove("active");
    document.querySelector(".speech-toolbar").classList.remove("hidden");
    document.querySelector(".main").classList.remove("learning-mode");
  });
  $("learningPrev").addEventListener("click", () => { progress.selectedDay--; wordGroup = 0; save(); render(); });
  $("learningNext").addEventListener("click", () => { progress.selectedDay++; wordGroup = 0; save(); render(); });
  $("learningTranslateInput").addEventListener("input", () => {
    translationGeneration++;
    if (translationRequest) window.smartTrans.cancel(translationRequest);
    translationRequest = null;
    $("learningTranslateStatus").textContent = "等待输入完成…";
    clearTimeout(translationTimer);
    translationTimer = setTimeout(translateInput, 700);
  });
  window.smartTrans.onProgress(event => {
    if (event.requestId !== translationRequest || event.type !== "text") return;
    $("learningTranslateOutput").textContent = event.text;
    $("learningTranslateOutput").classList.remove("hidden");
    $("learningTranslateStatus").textContent = "翻译中…";
  });
  $("learningTranslateSpeak").addEventListener("click", () => speak($("learningTranslateInput").value));
  $("learningRecap").addEventListener("click", async () => {
    const box = $("learningRecapOutput"); box.classList.remove("hidden"); box.textContent = "正在整理学习记录…";
    const summary = JSON.stringify({ completedDays: LearningCore.completedCount(progress), selectedDay: progress.selectedDay + 1,
      masteredWords: Object.values(progress.days).reduce((n,s) => n + (s.words?.length || 0), 0),
      mistakes: Object.values(progress.mistakes).map(m => ({ topic: m.topic, explanation: m.explanation })).slice(0, 15) });
    try { box.textContent = await assist("recap", summary); }
    catch (error) { box.textContent = error.message; }
  });
  if (localStorage.getItem("smart-trans-mode") === "learning") setMode(true);
  window.LearningView = { isActive: () => active, close: () => setMode(false) };
})();
