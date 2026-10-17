// 命题工具箱：把题库写成「题型 + 题干 + 选项 + 答案 + 解析」五件套。
// 四种题型的唯一区别是候选答案的文字与题面附件（材料、时间轴），
// 组卷、判题、渲染完全共用一套逻辑，作答一律是点选一个候选。
export const TYPE_IDS = ['choice', 'blank', 'material', 'timeline'];

export const TYPE_LABEL = {
  choice: '选择题',
  blank: '填空题',
  material: '材料题',
  timeline: '时间轴题',
};

// 选择题 / 材料题：四选一，选项按 A、B、C、D 顺序渲染。
export const choice = (stem, options, answer, explain) => ({ type: 'choice', stem, options, answer, explain });

// 填空题：题干里写一个 ____ 作为空格，answer 是正确词在 options 中的下标。
export const blank = (stem, options, answer, explain) => ({ type: 'blank', stem, options, answer, explain });

// 材料题：先读一段材料，再回答一个四选一的小问。
export const material = (text, stem, options, answer, explain) => ({ type: 'material', material: text, stem, options, answer, explain });

// 时间轴题：给一条按年份排好的时间轴，其中一处留空（text 写空字符串），
// 让学生从候选事件里挑出该位置应当出现的那一件。考的是时序与事件对应。
//   axis: [{ year: '1840 年', text: '鸦片战争爆发' }, { year: '1842 年', text: '' }, ...]
export const timeline = (axis, stem, options, answer, explain) => ({ type: 'timeline', axis, stem, options, answer, explain });
