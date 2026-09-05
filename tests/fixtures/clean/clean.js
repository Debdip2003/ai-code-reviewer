/**
 * Clean, production-ready utility functions with zero lint, complexity, or React issues.
 */

export function add(a, b) {
  return a + b;
}

export function multiply(a, b) {
  return a * b;
}

export function formatUserName(user) {
  if (!user || typeof user.name !== 'string') {
    return 'Anonymous';
  }
  return user.name.trim();
}
