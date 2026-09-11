import React, { useState } from 'react';

export default function ItemList() {
  const [items, setItems] = useState([]);

  function handleDelete(id) {
    setItems(items.filter((i) => i.id !== id));
  }

  function ItemCard() {
    return (
      <div>
        {items.map((it) => (
          <button key={it.id} onClick={() => handleDelete(it.id)}>
            {it.name}
          </button>
        ))}
      </div>
    );
  }

  return <ItemCard />;
}
