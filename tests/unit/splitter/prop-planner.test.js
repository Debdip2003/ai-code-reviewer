import { describe, it, expect } from 'vitest';
import { planReactProps, injectComponentProps, createJsxAttributes } from '../../../src/splitter/prop-planner.js';
import { parseAst, generateCode } from '../../../src/splitter/ast-utils.js';

describe('Prop Planner', () => {
  it('should plan props with conventional callback names for React component', () => {
    const candidate = { kind: 'react-component', symbolName: 'UserCard' };
    const capturedBindings = [
      { name: 'selectedUser', usage: 'read', propName: 'selectedUser' },
      { name: 'handleDelete', usage: 'call', propName: 'onDelete' }
    ];

    const result = planReactProps({ candidate, capturedBindings });
    expect(result.destructuredPropNames).toEqual(['selectedUser', 'onDelete']);
    expect(result.callSiteProps).toEqual([
      { name: 'selectedUser', valueName: 'selectedUser' },
      { name: 'onDelete', valueName: 'handleDelete' }
    ]);
  });

  it('should inject destructured props into AST function parameter and rename body references', () => {
    const source = `
      function UserCard() {
        return <button onClick={() => handleDelete(selectedUser.id)}>{selectedUser.name}</button>;
      }
    `;
    const ast = parseAst(source, 'card.jsx');
    const funcNode = ast.program.body[0];

    const propMappings = [
      { originalName: 'selectedUser', propName: 'selectedUser' },
      { originalName: 'handleDelete', propName: 'onDelete' }
    ];

    const transformed = injectComponentProps(funcNode, propMappings);
    const code = generateCode(transformed);

    expect(code).toContain('selectedUser');
    expect(code).toContain('onDelete');
    expect(code).toContain('onDelete(selectedUser.id)');
    expect(code).not.toContain('handleDelete');
  });

  it('should generate JSX attribute AST nodes for call site', () => {
    const callSiteProps = [
      { name: 'selectedUser', valueName: 'selectedUser' },
      { name: 'onDelete', valueName: 'handleDelete' }
    ];

    const attrs = createJsxAttributes(callSiteProps);
    expect(attrs.length).toBe(2);
    expect(attrs[0].name.name).toBe('selectedUser');
    expect(attrs[0].value.expression.name).toBe('selectedUser');
    expect(attrs[1].name.name).toBe('onDelete');
    expect(attrs[1].value.expression.name).toBe('handleDelete');
  });
});
