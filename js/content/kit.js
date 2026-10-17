// 命题工具箱：把题库写成「题型 + 题干 + 选项 + 答案 + 解析」五件套。
// 四种题型的唯一区别是候选答案的文字，组卷、判题、渲染完全共用一套逻辑。
export const TYPE_IDS = ['choice', 'judge', 'blank', 'material'];

export const TYPE_LABEL = {
  choice: '选择题',
  judge: '判断题',
  blank: '填空题',
  material: '材料题',
};

// 选择题 / 材料题：四选一，选项按 A、B、C、D 顺序渲染。
export const choice = (stem, options, answer, explain) => ({ type: 'choice', stem, options, answer, explain });

// 判断题：选项固定为「对 / 错」，answer 传 0 或 1，题面写成一句可判断的陈述。
export const judge = (stem, answer, explain) => ({ type: 'judge', stem, options: ['对', '错'], answer, explain });

// 填空题：题干里写一个 ____ 作为空格，answer 是正确词在 options 中的下标。
export const blank = (stem, options, answer, explain) => ({ type: 'blank', stem, options, answer, explain });

// 材料题：先读一段材料，再回答一个四选一的小问。
export const material = (text, stem, options, answer, explain) => ({ type: 'material', material: text, stem, options, answer, explain });
