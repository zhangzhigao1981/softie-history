// One shared, authored beginner bank. Chinese cues disambiguate the short sentences.
export const TOPICS = ['动物', '食物与饮料', '家人和身体', '颜色和数字', '玩具和日常物品', '动作和感受'];
const groups = [
  ['cat:猫', 'dog:狗', 'pig:猪', 'cow:奶牛', 'duck:鸭子', 'bird:鸟', 'fish:鱼', 'rabbit:兔子', 'horse:马', 'sheep:绵羊', 'goat:山羊', 'hen:母鸡', 'frog:青蛙', 'mouse:老鼠', 'bee:蜜蜂', 'lion:狮子', 'tiger:老虎', 'bear:熊', 'monkey:猴子', 'elephant:大象'],
  ['apple:苹果', 'banana:香蕉', 'pear:梨', 'orange:橙子', 'grape:葡萄', 'peach:桃子', 'mango:芒果', 'lemon:柠檬', 'melon:甜瓜', 'berry:浆果', 'bread:面包', 'rice:米饭', 'egg:鸡蛋', 'cake:蛋糕', 'milk:牛奶', 'water:水', 'juice:果汁', 'soup:汤', 'corn:玉米', 'cheese:奶酪'],
  ['mom:妈妈', 'dad:爸爸', 'baby:宝宝', 'sister:姐妹', 'brother:兄弟', 'grandma:奶奶或外婆', 'grandpa:爷爷或外公', 'family:家人', 'friend:朋友', 'boy:男孩', 'girl:女孩', 'eye:眼睛', 'ear:耳朵', 'nose:鼻子', 'mouth:嘴巴', 'hand:手', 'foot:脚', 'arm:手臂', 'leg:腿', 'head:头'],
  ['red:红色', 'blue:蓝色', 'green:绿色', 'yellow:黄色', 'pink:粉色', 'black:黑色', 'white:白色', 'brown:棕色', 'purple:紫色', 'gray:灰色', 'one:一', 'two:二', 'three:三', 'four:四', 'five:五', 'six:六', 'seven:七', 'eight:八', 'nine:九', 'ten:十'],
  ['ball:球', 'doll:娃娃', 'kite:风筝', 'car:汽车', 'train:火车', 'boat:小船', 'robot:机器人', 'teddy:玩具熊', 'book:书', 'pen:钢笔', 'pencil:铅笔', 'bag:包', 'cup:杯子', 'hat:帽子', 'shoe:鞋子', 'sock:袜子', 'bed:床', 'chair:椅子', 'table:桌子', 'clock:时钟'],
  ['run:跑', 'jump:跳', 'walk:走', 'sit:坐', 'stand:站', 'clap:拍手', 'sing:唱歌', 'dance:跳舞', 'read:阅读', 'draw:画画', 'eat:吃', 'drink:喝', 'swim:游泳', 'fly:飞', 'play:玩', 'happy:开心的', 'sad:难过的', 'sleepy:困的', 'hungry:饿的', 'angry:生气的'],
];
const counts = [[7, 7], [7, 7], [7, 6], [7, 6], [6, 7], [6, 7]];
const massFood = new Set(['bread', 'rice', 'milk', 'water', 'juice', 'soup', 'corn', 'cheese']);
const units = ['一个', '两个', '三个', '四个', '五个', '六个', '七个', '八个', '九个', '十个'];

function example(topic, index, word, meaning) {
  const article = /^[aeiou]/.test(word) ? 'an' : 'a';
  if (topic === 0) return ['I see ' + article + ' ____.', `我看见一只${meaning}。`, 'I see'];
  if (topic === 1 && massFood.has(word)) return ['I like ____.', `我喜欢${meaning}。`, 'I like'];
  if (topic === 1) return [`This is ${article} ____.`, `这是一个${meaning}。`, 'This is'];
  if (topic === 2 && index < 9) {
    const cue = { sister: '姐妹', brother: '兄弟', grandma: '奶奶', grandpa: '爷爷', family: '家人', friend: '朋友' }[word] || meaning;
    return ['This is my ____.', `这是我的${cue}。`, 'This is my'];
  }
  if (topic === 2 && index < 11) return [`This is ${article} ____.`, `这是一个${meaning}。`, 'This is'];
  if (topic === 2) return ['This is my ____.', `这是我的${meaning}。`, 'This is my'];
  if (topic === 3 && index < 10) return ['It is ____.', `它是${meaning}的。`, 'It is'];
  if (topic === 3) return [index === 10 ? 'I have ____ ball.' : 'I have ____ balls.', `我有${units[index - 10]}球。`, 'I have (number)'];
  if (topic === 4) return [`I have ${article} ____.`, `我有一个${meaning}。`, 'I have'];
  if (index >= 15) return ['I am ____.', `我${{ happy: '很开心', sad: '很难过', sleepy: '困了', hungry: '饿了', angry: '很生气' }[word]}。`, 'I am'];
  if (word === 'play') return ["Let's ____!", '我们一起玩吧！', "Let's"];
  if (word === 'eat' || word === 'drink') return ['I can ____.', `我会${meaning}。`, 'I can'];
  return ['I can ____.', `我会${meaning}。`, 'I can'];
}

export const VOCABULARY = groups.flatMap((group, topic) => group.map((item, index) => {
  const [word, meaning] = item.split(':');
  const level = index < counts[topic][0] ? 1 : index < counts[topic][0] + counts[topic][1] ? 2 : 3;
  const [context, translation, pattern] = example(topic, index, word, meaning);
  // Distractors stay in the same semantic group (colors/numbers, verbs/adjectives).
  const subset = topic === 3 ? group.slice(index < 10 ? 0 : 10, index < 10 ? 10 : 20)
    : topic === 5 ? group.slice(index < 15 ? 0 : 15, index < 15 ? 15 : 20) : group;
  const choices = subset.map(entry => entry.split(':')[0]);
  const at = choices.indexOf(word);
  const distractors = [1, 2, 3].map(offset => choices[(at + offset) % choices.length]);
  return { id: `word-${word}`, word, meaning, topic: TOPICS[topic], level, context, translation, pattern, distractors };
}));
