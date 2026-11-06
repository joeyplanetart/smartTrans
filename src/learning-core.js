/* Shared curriculum and progress rules. No network or account is required. */
const LearningCore = (() => {
  const extraVocabulary = typeof module !== "undefined" ? require("./learning-vocabulary.js") : LearningVocabulary;
  const dailyGrammar = typeof module !== "undefined" ? require("./learning-grammar.js") : LearningGrammar;
  const phonetics = typeof module !== "undefined" ? require("./learning-phonetics.js") : LearningPhonetics;
  const weeks = [
    { title: "日常基础", goal: "用熟悉的场景建立表达信心", grammar: { name: "一般现在时", tip: "描述习惯和事实。第三人称单数的动词通常加 s。", question: "She ___ English every morning.", options: ["study", "studies", "studying"], answer: 1, reason: "She 是第三人称单数，study 变为 studies。" }, words: [
      ["daily","每日的","I practice English daily."],["habit","习惯","Reading is a good habit."],["often","经常","I often read at night."],["usually","通常","She usually walks home."],["practice","练习","Practice helps me improve."],["improve","提高","I want to improve my English."],["simple","简单的","Start with a simple sentence."],["choose","选择","Choose one word to learn."],["remember","记住","I remember this word."],["explain","解释","Can you explain it?"],["question","问题","I have a question."],["answer","回答","I know the answer."],["listen","听","Listen to this sentence."],["repeat","重复","Repeat the word aloud."],["describe","描述","Describe your day."]], passage: "I study English for twenty minutes every day. I read a short story, listen to one sentence, and write three new words. Small habits help me improve.", reading: "How long does the writer study every day?", readingOptions: ["Twenty minutes", "Two hours", "One week"], readingAnswer: 0, writing: "用英语写 2–3 句，介绍你的日常学习习惯。" },
    { title: "生活沟通", goal: "谈过去的经历和真实需求", grammar: { name: "一般过去时", tip: "描述已经发生的事。规则动词通常加 ed；不规则动词需单独记忆。", question: "Yesterday, I ___ a new word.", options: ["learn", "learned", "learning"], answer: 1, reason: "Yesterday 表示过去，learn 用过去式 learned。" }, words: [
      ["arrive","到达","I arrived at school early."],["decide","决定","I decided to study tonight."],["invite","邀请","She invited me to join."],["prepare","准备","Prepare a short answer."],["borrow","借入","May I borrow your book?"],["return","归还；返回","Please return the book."],["notice","注意到","I noticed a mistake."],["suggest","建议","Can you suggest a plan?"],["share","分享","Share your idea with me."],["compare","比较","Compare these two sentences."],["continue","继续","Continue reading the story."],["complete","完成","I completed the lesson."],["support","支持","My friends support me."],["promise","承诺","I promise to practice."],["discuss","讨论","Let's discuss the answer."]], passage: "Last week, Mei joined an English club. She felt nervous at first, but her classmates listened and helped. After the meeting, she decided to return next week.", reading: "Why did Mei decide to return?", readingOptions: ["The club helped her", "She lost her book", "She missed a train"], readingAnswer: 0, writing: "用英语写 2–3 句，讲一件最近发生的小事。" },
    { title: "观点表达", goal: "清楚表达理由、选择和计划", grammar: { name: "连接词 because / although", tip: "because 引出原因；although 引出转折。一个句子里无需再加 so / but。", question: "I kept reading ___ the text was difficult.", options: ["because", "although", "so"], answer: 1, reason: "困难却继续阅读，表示转折，用 although。" }, words: [
      ["opinion","观点","In my opinion, practice matters."],["reason","原因","Give one reason for your choice."],["however","然而","However, I need more time."],["although","虽然","Although it is hard, I will try."],["because","因为","I study because I enjoy it."],["instead","代替；反而","I listened instead of reading."],["prefer","更喜欢","I prefer short stories."],["consider","考虑","Consider another example."],["possible","可能的","It is possible to improve."],["challenge","挑战","This task is a challenge."],["opportunity","机会","Use every opportunity to speak."],["benefit","益处","Reading has many benefits."],["develop","发展","Develop a learning routine."],["confident","自信的","I feel more confident now."],["effective","有效的","This method is effective."]], passage: "Some learners prefer reading because they can move at their own speed. Others learn better by listening. Although the methods differ, regular practice benefits everyone.", reading: "What benefits everyone?", readingOptions: ["Regular practice", "Only reading", "Only listening"], readingAnswer: 0, writing: "用英语写 3 句，说说你更喜欢阅读还是听力，并解释原因。" },
    { title: "进阶运用", goal: "理解较复杂的句子并组织短文", grammar: { name: "现在完成时", tip: "have / has + 过去分词，强调过去开始或发生的事与现在的联系。", question: "I ___ three English articles this week.", options: ["have read", "readed", "am read"], answer: 0, reason: "this week 与到现在的经历有关，用 have read。" }, words: [
      ["approach","方法","Try a different approach."],["analyze","分析","Analyze the main idea."],["evidence","证据","Find evidence in the text."],["conclude","得出结论","We can conclude that it works."],["assume","假设","Do not assume every word is new."],["context","上下文","Guess the meaning from context."],["specific","具体的","Use a specific example."],["general","普遍的","This is a general rule."],["accurate","准确的","Try to give an accurate answer."],["complex","复杂的","Break a complex sentence apart."],["maintain","保持","Maintain a steady habit."],["reflect","反思","Reflect on your mistakes."],["strategy","策略","Choose a useful strategy."],["progress","进步","Your progress is visible."],["independent","独立的","Become an independent learner."]], passage: "Lin has kept a learning journal for a month. At first, complex articles seemed impossible. She learned to use context, record mistakes, and review them every week. Now she can explain the main idea more accurately.", reading: "What helped Lin understand articles?", readingOptions: ["Using context and reviewing mistakes", "Skipping every article", "Memorizing only titles"], readingAnswer: 0, writing: "用英语写 3–4 句，总结你已取得的进步和接下来的学习策略。" }
  ];
  const topics = ["词汇", "语法", "听力", "口语", "阅读", "写作"];
  const day = index => {
    const safe = Math.max(0, Math.min(19, index));
    const week = Math.floor(safe / 5), within = safe % 5;
    return { index: safe, week, within, ...weeks[week],
      words: [...weeks[week].words.slice(within * 3, within * 3 + 3), ...extraVocabulary[safe]]
        .map(([english, chinese, example]) => [english, chinese, example, phonetics[english]]),
      grammarQuestions: dailyGrammar[safe] };
  };
  function emptyProgress() { return { version: 1, selectedDay: 0, days: {}, mistakes: {}, minutes: 0 }; }
  function normalize(value) {
    const base = emptyProgress();
    if (!value || value.version !== 1) return base;
    return { ...base, selectedDay: Number.isInteger(value.selectedDay) ? Math.max(0, Math.min(19, value.selectedDay)) : 0,
      days: value.days && typeof value.days === "object" ? value.days : {},
      mistakes: value.mistakes && typeof value.mistakes === "object" ? value.mistakes : {},
      minutes: Number.isFinite(value.minutes) ? Math.max(0, value.minutes) : 0 };
  }
  function recordAnswer(progress, key, correct, topic, explanation) {
    if (correct) delete progress.mistakes[key];
    else progress.mistakes[key] = { topic, explanation, at: Date.now() };
  }
  function completedCount(progress) { return Object.values(progress.days).filter(item => item?.completed).length; }
  return { weeks, topics, day, emptyProgress, normalize, recordAnswer, completedCount };
})();
if (typeof module !== "undefined") module.exports = LearningCore;
