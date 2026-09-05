import React, { useState, useEffect } from 'react';

export function BadUserProfile({ userId }) {
  const [userList, setUserList] = useState([]);

  // Async useEffect callback anti-pattern
  useEffect(async () => {
    // Direct state mutation anti-pattern
    userList.push({ id: userId, name: 'Alice' });
  }, [userId]);

  return (
    <div>
      {userList.map((item, index) => (
        // Array index key anti-pattern
        <div key={index}>
          <span>{item.name}</span>
        </div>
      ))}
    </div>
  );
}
