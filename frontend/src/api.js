import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

// FastAPI error bodies aren't always a plain string (422 validation errors come back
// as an array of {loc, msg, type} objects, and our payment guard returns an object).
// Rendering a non-string directly in JSX crashes the page, so always coerce to a string.
export const errMsg = (err, fallback = 'Something went wrong') => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d))).join(', ');
  }
  if (detail && typeof detail === 'object') return detail.message || JSON.stringify(detail);
  return err?.message || fallback;
};

export const authHeader = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
});

// Thin wrapper: adds the auth header and, on a 401, logs the user out once and throws an
// error flagged `handled` so callers can simply ignore it.
export function makeApi(onAuthError) {
  const run = async (p) => {
    try {
      return (await p).data;
    } catch (e) {
      if (onAuthError(e)) {
        const handled = new Error('auth');
        handled.handled = true;
        throw handled;
      }
      throw e;
    }
  };
  return {
    get: (url) => run(axios.get(`${API_BASE}${url}`, authHeader())),
    post: (url, body) => run(axios.post(`${API_BASE}${url}`, body, authHeader())),
    patch: (url, body) => run(axios.patch(`${API_BASE}${url}`, body, authHeader())),
    del: (url) => run(axios.delete(`${API_BASE}${url}`, authHeader())),
  };
}

// Show an error toast unless it was an auth error (already handled by logging out)
export const reportError = (toast, e, fallback) => {
  if (e?.handled) return;
  toast({ tone: 'error', title: errMsg(e, fallback) });
};

// The payment guard answers 409 with { code: 'possible_duplicate', message, matches: [...] }
export const duplicateWarning = (e) => {
  const d = e?.response?.data?.detail;
  return e?.response?.status === 409 && d && typeof d === 'object' && d.code === 'possible_duplicate' ? d : null;
};
