export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500
};

export const RETRY_POLICY = {
  maxRetries: 3,
  backoffFactor: 1.5,
  initialDelayMs: 250
};

export function sanitizeQueryParam(param) {
  if (typeof param !== 'string') return '';
  return param.trim().replace(/[^a-zA-Z0-9_.-]/g, '');
}

export function buildQueryString(params) {
  if (!params || typeof params !== 'object') return '';
  const entries = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

export async function fetchUserData(userId, options = {}) {
  const cleanId = sanitizeQueryParam(userId);
  const query = buildQueryString(options);
  const response = await fetch(`/api/users/${cleanId}${query}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch user ${cleanId}: ${response.statusText}`);
  }
  return response.json();
}

export async function saveUserSettings(userId, settings) {
  const cleanId = sanitizeQueryParam(userId);
  const response = await fetch(`/api/users/${cleanId}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  if (!response.ok) {
    throw new Error(`Failed to save settings for user ${cleanId}`);
  }
  return response.json();
}
