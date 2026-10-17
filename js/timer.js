// Wall-clock countdown. Animations, explanations, dialogs and background tabs
// do not spend the player's thinking time. Both blanks share one budget.
// 每题的作答时限由题型决定：材料题要读材料，给的时间更长。
export function questionSeconds(type) {
  return (type && type.seconds) || 40;
}
export function countdown(left, elapsed, active) {
  return active ? Math.max(0, left - Math.max(0, elapsed)) : left;
}

