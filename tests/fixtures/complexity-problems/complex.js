/**
 * Function with high cyclomatic complexity, deep nesting, and too many parameters.
 */

export function overlyComplexLogic(p1, p2, p3, p4, p5, p6, p7) {
  let result = 0;
  if (p1) {
    if (p2) {
      if (p3) {
        if (p4) {
          if (p5) {
            while (result < 10) {
              if (p6 && p7) {
                result += 1;
              } else if (p6 || p7) {
                result += 2;
              } else {
                result += 3;
              }
            }
          }
        }
      }
    }
  }

  switch (result) {
    case 1:
      result = p1 ? 10 : 20;
      break;
    case 2:
      result = p2 ? 30 : 40;
      break;
    case 3:
      result = p3 ? 50 : 60;
      break;
    default:
      result = 100;
  }

  return result;
}
