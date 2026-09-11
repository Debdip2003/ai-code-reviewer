import React from 'react';

export interface UserProfileProps {
  name: string;
  avatarUrl: string;
}

export function ProfileBadge({ name, avatarUrl }: UserProfileProps): JSX.Element {
  return (
    <div className="badge">
      <img src={avatarUrl} alt={name} />
      <span>{name}</span>
    </div>
  );
}

export function ProfilePage(): JSX.Element {
  return (
    <div>
      <h1>Profile</h1>
      <ProfileBadge name="Jane Doe" avatarUrl="https://example.com/avatar.png" />
    </div>
  );
}
