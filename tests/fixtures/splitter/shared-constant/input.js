const STATUS_LOOKUP = {
  active: 'Active',
  pending: 'Pending',
  inactive: 'Inactive'
};

export function getStatusLabel(status) {
  return STATUS_LOOKUP[status] || 'Unknown';
}

export function isStatusActive(status) {
  return status === 'active';
}
