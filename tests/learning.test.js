const { test, expect } = require("bun:test");
const LearningCore = require("../src/learning-core.js");
const { JSDOM } = require("jsdom");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("the 20-day path advances vocabulary from daily to advanced use", () => {
  expect(LearningCore.day(0).words.slice(0, 3).map(word => word[0])).toEqual(["daily", "habit", "often"]);
  expect(LearningCore.day(19).words.slice(0, 3).map(word => word[0])).toEqual(["strategy", "progress", "independent"]);
  const days = Array.from({ length: 20 }, (_, index) => LearningCore.day(index));
  expect(days.every(day => day.words.length === 30 && day.grammarQuestions.length === 3)).toBe(true);
  expect(new Set(days.flatMap(day => day.words.map(word => word[0]))).size).toBe(600);
  expect(days.every(day => day.words.every(word => /^\/.+\/$/.test(word[3])))).toBe(true);
});

test("learning page opens, tracks a word, and returns to text mode", () => {
  const root = join(__dirname, "../src");
  const dom = new JSDOM(readFileSync(join(root, "index.html"), "utf8"), { runScripts: "outside-only", url: "http://localhost" });
  const spoken = [];
  dom.window.smartTrans = { speak: async payload => { spoken.push(payload); return { ok: true }; }, translate: async () => ({ ok: true, translation: "中文" }),
    cancel: async () => {}, learningAssist: async () => ({ ok: true, feedback: "继续练习" }), onProgress: () => {}, onSpeechState: () => {} };
  dom.window.TextTranslation = { isBusy: () => false };
  dom.window.JiraView = { isBusy: () => false, isActive: () => false, close: () => {} };
  dom.window.LearningCore = LearningCore;
  dom.window.eval(readFileSync(join(root, "learning-view.js"), "utf8"));
  dom.window.document.getElementById("learningModeButton").click();
  expect(dom.window.document.getElementById("learningWorkspace").classList.contains("hidden")).toBe(false);
  expect(dom.window.document.querySelectorAll(".learning-word")).toHaveLength(10);
  expect(dom.window.document.querySelector(".learning-ipa").textContent).toBe("/ˈdeɪɫi/");
  expect(dom.window.document.querySelectorAll(".learning-grammar-question")).toHaveLength(3);
  dom.window.document.querySelector(".learning-word-head button").click();
  expect(spoken[0]).toEqual({ text: "daily", mode: "read", rate: 170 });
  dom.window.document.querySelector(".learning-word > button").click();
  expect(dom.window.document.getElementById("learningWords").textContent).toBe("1");
  dom.window.document.getElementById("textModeButton").click();
  expect(dom.window.document.getElementById("learningWorkspace").classList.contains("hidden")).toBe(true);
});

test("wrong answers enter review and a later correct answer clears them", () => {
  const progress = LearningCore.emptyProgress();
  LearningCore.recordAnswer(progress, "grammar-0", false, "一般现在时", "She studies.");
  expect(Object.keys(progress.mistakes)).toEqual(["grammar-0"]);
  LearningCore.recordAnswer(progress, "grammar-0", true, "一般现在时", "She studies.");
  expect(Object.keys(progress.mistakes)).toHaveLength(0);
});
