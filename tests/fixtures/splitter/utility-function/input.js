export function formatDate(timestamp, format = 'YYYY-MM-DD') {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateTime(timestamp) {
  return `${formatDate(timestamp)} 00:00:00`;
}
