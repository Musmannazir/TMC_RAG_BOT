// Defined independently from api.js (rather than imported) to avoid a
// circular import between auth.js and api.js, since api.js needs authHeader().
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const TOKEN_KEY = "tmc_auth_token";
const USER_KEY = "tmc_auth_user";

/** Read the stored JWT, or null if not logged in. */
export function getToken() {
  // Checks both possible keys to prevent any legacy mismatch bugs
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem("token");
}

/** Read the stored user object ({id, name, email, role}), or null. */
export function getUser() {
  // Checks both possible keys to prevent any legacy mismatch bugs
  const raw = localStorage.getItem(USER_KEY) || localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return !!getToken();
}

function persistSession(data) {
  const token = data.access_token || data.token;
  const user = data.user;

  if (token) {
    localStorage.setItem("tmc_auth_token", token);
    localStorage.setItem("token", token); // Fallback key
  }
  if (user) {
    localStorage.setItem("tmc_auth_user", JSON.stringify(user));
    localStorage.setItem("user", JSON.stringify(user)); // Fallback key
  }
}

/** Header object to spread into any authenticated fetch call. */
export function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function _parseErrorDetail(res) {
  try {
    const data = await res.json();
    return data.detail || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/** POST /auth/signup — creates the account and logs the user in immediately. */
export async function signup({ name, email, password, role }) {
  const res = await fetch(`${BACKEND_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, role }),
  });
  if (!res.ok) {
    throw new Error(await _parseErrorDetail(res));
  }
  const data = await res.json();
  persistSession(data);
  return data.user;
}

/** POST /auth/login */
export async function login({ email, password }) {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(await _parseErrorDetail(res));
  }
  const data = await res.json();
  persistSession(data);
  return data.user;
}

/** Clear all possible auth keys upon logout */
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
