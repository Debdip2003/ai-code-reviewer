import React from 'react';

export function BrokenComponent() {
  function NestedHelper() {
    // Reference to undefined outer closure
    return <div>{undeclaredGlobalVar.missingProp}</div>;
  }

  return <NestedHelper />;
}
