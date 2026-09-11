import React, { useState } from 'react';

function UserCard({ user, onSelect }) {
  return (
    <div className="user-card" onClick={() => onSelect(user.id)}>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
}

export function Dashboard() {
  const [users, setUsers] = useState([
    { id: '1', name: 'Alice', email: 'alice@example.com' },
    { id: '2', name: 'Bob', email: 'bob@example.com' }
  ]);
  const [selectedId, setSelectedId] = useState(null);

  const handleSelect = (id) => {
    setSelectedId(id);
  };

  return (
    <div className="dashboard">
      <h1>User Dashboard</h1>
      <div className="card-list">
        {users.map((u) => (
          <UserCard key={u.id} user={u} onSelect={handleSelect} />
        ))}
      </div>
      {selectedId && <p>Selected user: {selectedId}</p>}
    </div>
  );
}
