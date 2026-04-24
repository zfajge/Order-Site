const API_BASE = "/api";

const signupForm = document.getElementById("signup-form");
const signinForm = document.getElementById("signin-form");
const signupMessage = document.getElementById("signup-message");
const signinMessage = document.getElementById("signin-message");

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  }
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

function redirectForRole(role) {
  window.location.href = role === "seller" ? "/seller" : "/";
}

async function submitSignUp(event) {
  event.preventDefault();
  setMessage(signupMessage, "");

  const email = normalizeText(document.getElementById("signup-email").value).toLowerCase();
  const password = normalizeText(document.getElementById("signup-password").value);
  const displayName = normalizeText(document.getElementById("signup-display-name").value);
  const phone = normalizeText(document.getElementById("signup-phone").value);
  const role = normalizeText(document.getElementById("signup-role").value);

  if (!email || !password || !displayName || !role) {
    setMessage(signupMessage, "All required fields must be filled out.", true);
    return;
  }

  try {
    const payload = await apiRequest("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName, phone, role }),
    });
    setMessage(signupMessage, "Account created. Redirecting...");
    redirectForRole(payload?.user?.role || role);
  } catch (error) {
    setMessage(signupMessage, error.message, true);
  }
}

async function submitSignIn(event) {
  event.preventDefault();
  setMessage(signinMessage, "");

  const email = normalizeText(document.getElementById("signin-email").value).toLowerCase();
  const password = normalizeText(document.getElementById("signin-password").value);
  if (!email || !password) {
    setMessage(signinMessage, "Email and password are required.", true);
    return;
  }

  try {
    const payload = await apiRequest("/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setMessage(signinMessage, "Signed in. Redirecting...");
    redirectForRole(payload?.user?.role || "buyer");
  } catch (error) {
    setMessage(signinMessage, error.message, true);
  }
}

async function init() {
  try {
    const me = await apiRequest("/me");
    if (me?.authenticated && me?.user?.role) {
      redirectForRole(me.user.role);
      return;
    }
  } catch {
    // continue with auth page
  }

  signupForm.addEventListener("submit", submitSignUp);
  signinForm.addEventListener("submit", submitSignIn);
}

init().catch((error) => {
  console.error(error);
  setMessage(signinMessage, "Failed to initialize sign-in page.", true);
});
