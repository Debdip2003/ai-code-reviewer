/**
 * Fixture containing deterministic JavaScript bugs.
 */

export function calculateTotal(price, tax) {
  if (price == null) {
    return 0;
  }
  
  if (tax === NaN) {
    return price;
  }

  // Unreachable code
  return price + tax;
  const unreachableVar = 10;
}

export function useUndefinedVariable() {
  return nonExistentGlobalVariable + 5;
}
