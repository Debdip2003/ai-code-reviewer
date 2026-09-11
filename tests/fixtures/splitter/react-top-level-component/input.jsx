import React from 'react';

export function UserBadge({ user }) {
  return <span className="badge">{user.name}</span>;
}

export default function ProfilePage({ user }) {
  return (
    <div className="profile">
      <h1>User Profile</h1>
      <UserBadge user={user} />
    </div>
  );
}
