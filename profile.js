const API_BASE = "/api";

const profileMeta = document.getElementById("profile-meta");
const statCreated = document.getElementById("stat-created");
const statSold = document.getElementById("stat-sold");
const statHeldForYou = document.getElementById("stat-held-for-you");
const statCheckouts = document.getElementById("stat-checkouts");
const activityList = document.getElementById("activity-list");
const logoutBtn = document.getElementById("logout-btn");

function formatDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) {
    return "Unknown time";
  }
  return new Date(timestamp).toLocaleString();
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

function renderActivities(entries) {
  activityList.innerHTML = "";
  if (!Array.isArray(entries) || !entries.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No activity yet.";
    activityList.appendChild(empty);
    return;
  }
  entries.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "activity-item";

    const type = document.createElement("p");
    type.className = "activity-type";
    type.textContent = String(entry.type || "activity").replaceAll("-", " ");

    const detail = document.createElement("p");
    detail.className = "muted";
    const itemText = entry.itemName ? `${entry.itemName}` : "Listing update";
    detail.textContent = `${itemText} · ${formatDate(entry.createdAt)}`;

    card.append(type, detail);
    activityList.appendChild(card);
  });
}

async function signOut() {
  try {
    await apiRequest("/auth/signout", { method: "POST" });
  } catch (error) {
    console.error(error);
  }
  window.location.href = "/signin";
}

async function init() {
  try {
    const me = await apiRequest("/me");
    if (!me?.authenticated || !me?.user) {
      window.location.href = "/signin?next=/profile";
      return;
    }
    const profilePayload = await apiRequest("/profile");
    const profile = profilePayload?.profile;
    if (!profile) {
      throw new Error("Could not load profile.");
    }

    const user = me.user;
    profileMeta.textContent = `${user.displayName || user.email} (${user.role}) · ${user.email}`;

    const summary = profile.summary || {};
    statCreated.textContent = String(summary.listingsCreatedCount || 0);
    statSold.textContent = String(summary.itemsSoldCount || 0);
    statHeldForYou.textContent = String(summary.itemsOnHoldCount || 0);
    statCheckouts.textContent = String(summary.holdRequestsCount || 0);
    renderActivities(profile.recentActivities || []);
  } catch (error) {
    profileMeta.textContent = error.message;
    profileMeta.classList.add("error");
    window.setTimeout(() => {
      window.location.href = "/signin";
    }, 1200);
  }

  logoutBtn.addEventListener("click", signOut);
}

init();
