import React from 'react';

export default function Counter() {
  let count = 0;

  function UnsafeChild() {
    count += 1;
    return <div>{count}</div>;
  }

  return <UnsafeChild />;
}
