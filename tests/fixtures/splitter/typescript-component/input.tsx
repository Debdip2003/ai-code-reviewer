import React from 'react';

export interface UserProps {
  id: string;
  name: string;
  age?: number;
}

export function UserProfile({ id, name, age }: UserProps): React.JSX.Element {
  return (
    <div className="user-profile">
      <span>{name} ({id})</span>
      {age && <span>Age: {age}</span>}
    </div>
  );
}

export default function Page(): React.JSX.Element {
  return <UserProfile id="1" name="Alice" age={30} />;
}
