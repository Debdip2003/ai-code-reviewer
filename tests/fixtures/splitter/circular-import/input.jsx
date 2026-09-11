import React from 'react';
import { helper } from './helper.js';

export function ComponentA() {
  helper();
  return <div>Component A</div>;
}

export default function Main() {
  return <ComponentA />;
}
