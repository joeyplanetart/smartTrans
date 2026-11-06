/* Three distinct grammar questions for each of the 20 learning days. */
const LearningGrammar = [
  "She ___ English every morning.|study|studies|studying|1|She 是第三人称单数，动词用 studies。~I ___ to school by bus.|go|goes|going|0|I 作主语，动词用原形 go。~They ___ in Shanghai.|lives|live|living|1|They 是复数，动词用 live。",
  "My brother ___ coffee.|like|likes|liking|1|第三人称单数用 likes。~We ___ dinner at six.|have|has|having|0|We 作主语用 have。~The sun ___ in the east.|rise|rises|rising|1|事实陈述用一般现在时，the sun 后用 rises。",
  "He ___ not work on Sundays.|do|does|is|1|第三人称单数否定句用 does not。~___ you read every day?|Do|Does|Are|0|一般现在时疑问句，you 前用 Do。~She ___ have a car.|don't|doesn't|isn't|1|第三人称单数的否定用 doesn't。",
  "What time ___ she start?|do|does|is|1|she 的一般现在时疑问句用 does。~Where ___ your parents live?|do|does|are|0|parents 是复数，疑问句用 do。~___ he usually cook at home?|Do|Does|Is|1|he 的一般现在时疑问句用 Does。",
  "My friend ___ English well.|speak|speaks|speaking|1|第三人称单数动词加 s。~I always ___ breakfast.|eat|eats|eating|0|频率副词后用一般现在时动词原形。~She usually ___ early.|get up|gets up|getting up|1|She 是第三人称单数，用 gets up。",
  "Yesterday, I ___ a new word.|learn|learned|learning|1|Yesterday 表示过去，learn 用 learned。~We ___ the museum last week.|visit|visited|visiting|1|last week 表示过去，用 visited。~She ___ late this morning.|arrive|arrived|arriving|1|已发生的事用 arrived。",
  "He ___ a letter yesterday.|write|wrote|written|1|write 的过去式是 wrote。~They ___ home early last night.|go|went|gone|1|go 的过去式是 went。~I ___ a good book last week.|read|reads|reading|0|read 的过去式拼写仍为 read。",
  "___ you call her yesterday?|Do|Did|Does|1|过去时疑问句用 Did。~She ___ not come to class.|did|does|is|0|过去时否定句用 did not。~Where ___ they stay last summer?|do|did|are|1|last summer 是过去时间，用 did。",
  "I ___ tired after the trip.|was|were|am|0|过去时 I 搭配 was。~They ___ happy yesterday.|was|were|are|1|过去时 they 搭配 were。~___ she at home last night?|Was|Were|Is|0|过去时 she 搭配 Was。",
  "We ___ a movie on Friday.|watch|watched|watches|1|过去时间用 watched。~He ___ his keys this morning.|lose|lost|losing|1|lose 的过去式是 lost。~I ___ to help, but I was busy.|want|wanted|wants|1|过去时用 wanted。",
  "I kept reading ___ the text was difficult.|because|although|so|1|困难却继续阅读，表示转折用 although。~I stayed home ___ it rained.|because|although|but|0|下雨是待在家的原因，用 because。~___ she was tired, she finished the task.|Because|Although|So|1|累却完成任务，表示转折用 Although。",
  "He studied hard, ___ he passed.|so|because|although|0|后句是结果，用 so。~I like this book ___ it is clear.|although|because|but|1|清晰是喜欢它的原因，用 because。~It was late, ___ we continued.|but|because|so|0|很晚却继续，表示转折用 but。",
  "___ I enjoy reading, I also practice speaking.|Although|Because|So|0|虽喜欢阅读但也练口语，表示让步用 Although。~I changed my plan ___ I was sick.|because|although|however|0|生病是改计划的原因，用 because。~She was nervous; ___, she spoke clearly.|however|because|so|0|前后转折，用 however。",
  "I prefer tea ___ coffee.|than|to|for|1|prefer A to B 表示比起 B 更喜欢 A。~This method is useful ___ it saves time.|because|although|but|0|省时是有用的原因。~The task was hard. ___, we completed it.|However|Therefore|Because|0|困难却完成，表示转折用 However。",
  "___ the weather was bad, we went out.|Although|Because|So|0|天气差却出门，表示转折。~I was ill, ___ I stayed at home.|so|although|because|0|生病导致待在家，用 so。~She practiced daily; ___, she improved.|therefore|however|although|0|练习带来进步，用 therefore。",
  "I ___ three English articles this week.|have read|readed|am read|0|this week 与到现在的经历有关，用 have read。~She ___ her homework already.|has finished|have finished|finish|0|she 搭配 has 加过去分词。~We ___ this film before.|have seen|has seen|seeing|0|we 搭配 have seen。",
  "He ___ in Beijing for five years.|has lived|have lived|lives yesterday|0|持续到现在，用 has lived。~I ___ my keys.|have lost|has lost|losing|0|I 搭配 have lost，表示现在仍受影响。~They ___ the task yet.|haven't completed|hasn't completed|not complete|0|they 搭配 haven't 加过去分词。",
  "___ you ever visited London?|Have|Has|Did|0|现在完成时疑问句，you 前用 Have。~She ___ never tried this food.|has|have|did|0|she 搭配 has。~We have ___ the answer.|find|found|finding|1|have 后用过去分词 found。",
  "I have studied English ___ 2020.|since|for|during|0|since 后接起始时间点。~He has worked here ___ three years.|since|for|at|1|for 后接一段时间。~They have lived here ___ last summer.|since|for|by|0|last summer 是起点，用 since。",
  "I ___ just finished my report.|have|has|did|0|I 搭配 have finished。~She has ___ to the library.|go|gone|went|1|has 后用过去分词 gone。~We ___ already discussed this idea.|have|has|are|0|we 搭配 have discussed。"
].map(line => line.split("~").map(item => {
  const [question, ...parts] = item.split("|");
  return { question, options: parts.slice(0, 3), answer: Number(parts[3]), reason: parts[4] };
}));
if (typeof module !== "undefined") module.exports = LearningGrammar;
