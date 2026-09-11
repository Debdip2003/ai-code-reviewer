import React, { useState, useEffect } from 'react';

export default function ConditionalComponent({ condition }) {
  if (condition) {
    useEffect(() => {
      console.log('bad conditional hook');
    }, []);
  }

  return <div>Conditional</div>;
}
