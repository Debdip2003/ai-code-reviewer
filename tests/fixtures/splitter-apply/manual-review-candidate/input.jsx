import React, { useState } from 'react';

export function OuterContainer() {
  const [count, setCount] = useState(0);

  // Nested function mutating outer state via closure
  function IncrementButton() {
    return (
      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    );
  }

  return (
    <div>
      <IncrementButton />
    </div>
  );
}
