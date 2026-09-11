import React from 'react';

export default function CleanSmallButton({ label, onClick }) {
  return (
    <button className="clean-btn" onClick={onClick}>
      {label}
    </button>
  );
}
