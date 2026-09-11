import React, { useState } from 'react';

export default function Dashboard() {
  const [selectedUser, setSelectedUser] = useState(null);

  function handleDelete(userId) {
    console.log('Delete', userId);
  }

  function UserCard() {
    return (
      <div className="user-card">
        <button onClick={() => handleDelete(selectedUser.id)}>
          {selectedUser.name}
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <UserCard />
    </div>
  );
}
