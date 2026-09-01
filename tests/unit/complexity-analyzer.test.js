import { describe, it, expect } from 'vitest';
import { parseJavaScript } from '../../src/parser/parse-javascript.js';
import { analyzeComplexity } from '../../src/analyzers/complexity-analyzer.js';

describe('analyzeComplexity', () => {
  function parseAndAnalyze(code, options = {}) {
    const ast = parseJavaScript({ source: code, filePath: 'src/test.js' });
    return analyzeComplexity({
      ast,
      relativePath: 'src/test.js',
      options
    });
  }

  describe('Function Identification and Names', () => {
    it('should name function declarations correctly', () => {
      const code = 'function calculateTotal() { return 1; }';
      const result = parseAndAnalyze(code);

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('calculateTotal');
      expect(result.functions[0].kind).toBe('function-declaration');
    });

    it('should name variable declarator functions correctly', () => {
      const code = 'const processOrder = (a, b) => a + b;';
      const result = parseAndAnalyze(code);

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('processOrder');
      expect(result.functions[0].kind).toBe('arrow-function');
    });

    it('should name object methods correctly', () => {
      const code = `
        const cart = {
          addItem(item) { return item; }
        };
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('addItem');
      expect(result.functions[0].kind).toBe('object-method');
    });

    it('should name class methods with ClassName.method', () => {
      const code = `
        class Cart {
          checkout() { return true; }
        }
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('Cart.checkout');
      expect(result.functions[0].kind).toBe('class-method');
    });

    it('should name class getters and setters with get/set prefix', () => {
      const code = `
        class Store {
          get total() { return 100; }
          set total(val) { this._val = val; }
        }
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions).toHaveLength(2);
      expect(result.functions[0].name).toBe('Store.get total');
      expect(result.functions[1].name).toBe('Store.set total');
    });

    it('should name anonymous callbacks with <anonymous@line>', () => {
      const code = `
        items.map(function(item) {
          return item.id;
        });
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('<anonymous@2>');
    });

    it('should name default exported anonymous function with <default-export@line>', () => {
      const code = 'export default function() { return 42; }';
      const result = parseAndAnalyze(code);

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('<default-export@1>');
    });

    it('should record async and generator flags correctly', () => {
      const code = `
        async function fetchUsers() {}
        function* generateIds() {}
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions[0].async).toBe(true);
      expect(result.functions[0].generator).toBe(false);

      expect(result.functions[1].async).toBe(false);
      expect(result.functions[1].generator).toBe(true);
    });
  });

  describe('Cyclomatic Complexity Calculations', () => {
    it('should give base complexity of 1 for empty function', () => {
      const code = 'function empty() {}';
      const result = parseAndAnalyze(code);

      expect(result.functions[0].cyclomaticComplexity).toBe(1);
    });

    it('should increment by 1 for if statements and not count plain else', () => {
      const code = `
        function test(x) {
          if (x > 0) {
            return 1;
          } else {
            return 0;
          }
        }
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions[0].cyclomaticComplexity).toBe(2);
    });

    it('should increment for ternary conditional expressions', () => {
      const code = 'function test(x) { return x > 0 ? 1 : 0; }';
      const result = parseAndAnalyze(code);

      expect(result.functions[0].cyclomaticComplexity).toBe(2);
    });

    it('should increment for each loop type once', () => {
      const code = `
        function loops(items) {
          for (let i = 0; i < 10; i++) {}
          for (const k in items) {}
          for (const item of items) {}
          while (true) { break; }
          do {} while (false);
        }
      `;
      const result = parseAndAnalyze(code);

      // 1 (base) + 5 (loops) = 6
      expect(result.functions[0].cyclomaticComplexity).toBe(6);
    });

    it('should increment for catch clauses and non-default switch cases', () => {
      const code = `
        function errorAndSwitch(val) {
          try {
            switch (val) {
              case 1:
                break;
              case 2:
                break;
              default:
                break;
            }
          } catch (err) {
            console.error(err);
          }
        }
      `;
      const result = parseAndAnalyze(code);

      // 1 (base) + 2 (case 1, case 2) + 1 (catch) = 4
      expect(result.functions[0].cyclomaticComplexity).toBe(4);
    });

    it('should increment for logical operators (&&, ||, ??) and not optional chaining', () => {
      const code = `
        function operators(a, b, c, d) {
          const val = a?.b?.c;
          return (a && b) || (c ?? d);
        }
      `;
      const result = parseAndAnalyze(code);

      // 1 (base) + 1 (&&) + 1 (||) + 1 (??) = 4
      expect(result.functions[0].cyclomaticComplexity).toBe(4);
    });

    it('should isolate nested function complexity from parent function', () => {
      const code = `
        function parent(items) {
          if (items.length > 0) {
            items.filter((item) => {
              if (item.active) {
                return item.count > 0;
              }
              return false;
            });
          }
        }
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions).toHaveLength(2);
      const parentFn = result.functions.find((f) => f.name === 'parent');
      const childFn = result.functions.find((f) => f.name !== 'parent');

      // Parent only has: base(1) + if(1) = 2
      expect(parentFn.cyclomaticComplexity).toBe(2);

      // Child arrow callback has: base(1) + if(1) = 2
      expect(childFn.cyclomaticComplexity).toBe(2);
    });
  });

  describe('Nesting Depth Calculations', () => {
    it('should give 0 depth when no control-flow structures exist', () => {
      const code = 'function simple() { const a = 1; return a; }';
      const result = parseAndAnalyze(code);

      expect(result.functions[0].maxNestingDepth).toBe(0);
    });

    it('should measure single and nested if statements', () => {
      const code = `
        function nested(a, b) {
          if (a) {
            if (b) {
              return 2;
            }
          }
          return 0;
        }
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions[0].maxNestingDepth).toBe(2);
    });

    it('should treat else if chains as continuing at the same logical depth', () => {
      const code = `
        function checkStatus(code) {
          if (code === 200) {
            return 'ok';
          } else if (code === 404) {
            return 'not found';
          } else if (code === 500) {
            return 'server error';
          } else {
            return 'unknown';
          }
        }
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions[0].maxNestingDepth).toBe(1);
    });

    it('should not double-count try and associated catch blocks', () => {
      const code = `
        function tryCatch() {
          try {
            doSomething();
          } catch (e) {
            handleError();
          }
        }
      `;
      const result = parseAndAnalyze(code);

      expect(result.functions[0].maxNestingDepth).toBe(1);
    });

    it('should reset depth for nested functions', () => {
      const code = `
        function outer() {
          if (true) {
            if (true) {
              const callback = () => {
                if (true) {
                  return 1;
                }
              };
            }
          }
        }
      `;
      const result = parseAndAnalyze(code);

      const outerFn = result.functions.find((f) => f.name === 'outer');
      const innerFn = result.functions.find((f) => f.name === 'callback');

      expect(outerFn.maxNestingDepth).toBe(2);
      expect(innerFn.maxNestingDepth).toBe(1);
    });
  });

  describe('Finding Generation & Severity Thresholds', () => {
    it('should generate high-cyclomatic-complexity finding with correct thresholds', () => {
      const code = `
        function complex(x) {
          if (x === 1) return 1;
          if (x === 2) return 2;
          if (x === 3) return 3;
          if (x === 4) return 4;
          return 0;
        }
      `;
      // Complexity is 5 (base 1 + 4 if statements)
      // Test at threshold = 4 -> finding generated (medium)
      const res1 = parseAndAnalyze(code, {
        maxCyclomaticComplexity: 4
      });
      expect(res1.findings).toHaveLength(1);
      expect(res1.findings[0].ruleId).toBe('complexity/high-cyclomatic-complexity');
      expect(res1.findings[0].severity).toBe('medium');
      expect(res1.findings[0].suggestion).toContain('Break the decision logic');

      // Test at threshold = 2 -> 5 >= 2 * 2 (4) -> severity = high
      const res2 = parseAndAnalyze(code, {
        maxCyclomaticComplexity: 2
      });
      expect(res2.findings[0].severity).toBe('high');

      // Test at threshold = 5 -> no finding
      const res3 = parseAndAnalyze(code, {
        maxCyclomaticComplexity: 5
      });
      expect(res3.findings).toHaveLength(0);
    });

    it('should generate too-many-parameters finding with low/medium/high thresholds', () => {
      const code = 'function lotsOfParams(a, b, c, d, e, f) {}'; // 6 params

      // Threshold 5: 6 = 5 + 1 -> 'low'
      const resLow = parseAndAnalyze(code, { maxParameters: 5 });
      expect(resLow.findings[0].ruleId).toBe('complexity/too-many-parameters');
      expect(resLow.findings[0].severity).toBe('low');

      // Threshold 4: 6 > 4 + 1 and 6 < 2 * 4 (8) -> 'medium'
      const resMed = parseAndAnalyze(code, { maxParameters: 4 });
      expect(resMed.findings[0].severity).toBe('medium');

      // Threshold 3: 6 >= 2 * 3 (6) -> 'high'
      const resHigh = parseAndAnalyze(code, { maxParameters: 3 });
      expect(resHigh.findings[0].severity).toBe('high');
    });

    it('should generate deep-nesting finding when threshold is exceeded', () => {
      const code = `
        function deep() {
          if (true) {
            if (true) {
              if (true) {
                return 1;
              }
            }
          }
        }
      `;
      const res = parseAndAnalyze(code, { maxNestingDepth: 2 });

      expect(res.findings).toHaveLength(1);
      expect(res.findings[0].ruleId).toBe('complexity/deep-nesting');
      expect(res.findings[0].severity).toBe('medium');
    });

    it('should return empty results when complexity analyzer is disabled', () => {
      const code = 'function tooManyParams(a, b, c, d, e, f, g, h, i, j) {}';
      const res = parseAndAnalyze(code, { enabled: false });

      expect(res.functions).toHaveLength(0);
      expect(res.findings).toHaveLength(0);
    });
  });
});
