import React, { useState, useEffect } from 'react';

export function UserDashboard({ user, onUpdate }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Missing error handling on async fetch
    fetch(`/api/user/${user.id}`)
      .then((res) => res.json())
      .then((d) => setData(d));
  }, [user.id]);

  function handleMutate() {
    // Direct state mutation issue
    data.lastSeen = Date.now();
    setData(data);
  }

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      <button onClick={handleMutate}>Update Last Seen</button>
      {data && <span>Status: {data.status}</span>}
    </div>
  );
}
