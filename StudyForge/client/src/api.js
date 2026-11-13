const TOKEN_KEY = "studyforge_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new ApiError(
      offline ? "You appear to be offline. Check your connection and try again." : "Can't reach the StudyForge server. Is it running?",
      0,
      "NETWORK",
    );
  }
  let data = {};
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") setToken(null);
    throw new ApiError(data.error || "Something went wrong. Please try again.", response.status, data.code);
  }
  return data;
}
