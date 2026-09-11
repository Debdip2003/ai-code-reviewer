/**
 * React Prop & Parameter Planner module for ACR Code Splitter.
 * Plans explicit props for nested React components and parameters for utility functions,
 * updating extracted declaration signatures and source call sites.
 */

import { mapConventionalPropName } from './extraction-contract.js';
import { cloneAstNode, t } from './ast-utils.js';

/**
 * Plans props for a React component candidate.
 *
 * @param {Object} params
 * @param {Object} params.candidate - Candidate definition.
 * @param {Array<{ name: string, usage: string, propName?: string }>} params.capturedBindings
 * @returns {{
 *   props: Array<{ originalName: string, propName: string, usage: string }>,
 *   destructuredPropNames: string[],
 *   callSiteProps: Array<{ name: string, valueName: string }>
 * }}
 */
export function planReactProps({ candidate, capturedBindings = [] }) {
  if (candidate.kind !== 'react-component' || capturedBindings.length === 0) {
    return {
      props: [],
      destructuredPropNames: [],
      callSiteProps: []
    };
  }

  const props = capturedBindings.map((cb) => {
    const propName = cb.propName || mapConventionalPropName(cb.name);
    return {
      originalName: cb.name,
      propName,
      usage: cb.usage
    };
  });

  const destructuredPropNames = props.map((p) => p.propName);
  const callSiteProps = props.map((p) => ({
    name: p.propName,
    valueName: p.originalName
  }));

  return {
    props,
    destructuredPropNames,
    callSiteProps
  };
}

/**
 * Transforms a React component AST node to accept a destructured props object parameter,
 * and updates any references to renamed props (e.g. handleDelete -> onDelete).
 *
 * @param {import('@babel/types').Function} functionNode
 * @param {Array<{ originalName: string, propName: string }>} propMappings
 * @returns {import('@babel/types').Function} Transformed function node clone.
 */
export function injectComponentProps(functionNode, propMappings = []) {
  const cloned = cloneAstNode(functionNode);
  if (!cloned || propMappings.length === 0) return cloned;

  // Build ObjectPattern for ({ prop1, prop2 })
  const properties = propMappings.map((pm) => {
    return t.objectProperty(
      t.identifier(pm.propName),
      t.identifier(pm.propName),
      false,
      true // shorthand: { onDelete }
    );
  });

  const propsParam = t.objectPattern(properties);

  if (cloned.params.length === 0) {
    cloned.params = [propsParam];
  } else if (cloned.params[0].type === 'ObjectPattern') {
    // Merge into existing destructured props
    const existingKeys = new Set(
      cloned.params[0].properties
        .filter((p) => p.type === 'ObjectProperty')
        .map((p) => p.key?.name)
    );
    for (const prop of properties) {
      if (!existingKeys.has(prop.key.name)) {
        cloned.params[0].properties.push(prop);
      }
    }
  } else if (cloned.params[0].type === 'Identifier') {
    // e.g. (props) -> add destructured properties or keep as is
    cloned.params.unshift(propsParam);
  }

  // If any prop was renamed (e.g. handleDelete -> onDelete), rename identifier references inside body
  const renames = new Map();
  for (const pm of propMappings) {
    if (pm.originalName !== pm.propName) {
      renames.set(pm.originalName, pm.propName);
    }
  }

  if (renames.size > 0 && cloned.body) {
    function renameIdentifiers(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier' && renames.has(node.name)) {
        node.name = renames.get(node.name);
      }
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const child of val) {
            if (child && typeof child === 'object') renameIdentifiers(child);
          }
        } else if (val && typeof val === 'object') {
          renameIdentifiers(val);
        }
      }
    }
    renameIdentifiers(cloned.body);
  }

  return cloned;
}

/**
 * Creates JSX attributes AST nodes for the call site.
 * e.g., <UserCard selectedUser={selectedUser} onDelete={handleDelete} />
 *
 * @param {Array<{ name: string, valueName: string }>} callSiteProps
 * @returns {Array<import('@babel/types').JSXAttribute>}
 */
export function createJsxAttributes(callSiteProps = []) {
  return callSiteProps.map(({ name, valueName }) => {
    return t.jsxAttribute(
      t.jsxIdentifier(name),
      t.jsxExpressionContainer(t.identifier(valueName))
    );
  });
}
