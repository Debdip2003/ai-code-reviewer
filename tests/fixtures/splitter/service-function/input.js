export async function fetchUserProfile(userId) {
  const response = await fetch(`/api/v1/users/${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  return response.json();
}

export async function updateUserProfile(userId, data) {
  const response = await fetch(`/api/v1/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  return response.json();
}
