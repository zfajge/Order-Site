const express = require("express");
const path = require("path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const crypto = require("node:crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL = normalizeEnv(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
const SUPABASE_ITEMS_TABLE = normalizeEnv(process.env.SUPABASE_ITEMS_TABLE) || "moveout_items";
const SUPABASE_USERS_TABLE = normalizeEnv(process.env.SUPABASE_USERS_TABLE) || "moveout_users";
const SUPABASE_LISTING_META_TABLE =
  normalizeEnv(process.env.SUPABASE_LISTING_META_TABLE) || "moveout_listing_meta";
const SUPABASE_ACTIVITY_TABLE =
  normalizeEnv(process.env.SUPABASE_ACTIVITY_TABLE) || "moveout_activity";
const SESSION_COOKIE_NAME = "moveout_session";
const SESSION_SECRET = normalizeEnv(process.env.SESSION_SECRET) || "moveout-dev-session-secret";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const AUTH_ROLES = new Set(["buyer", "seller"]);

const dataDirectory = path.join(__dirname, "data");
const dataFilePath = path.join(dataDirectory, "items.json");
const usersFilePath = path.join(dataDirectory, "users.json");
const listingMetaFilePath = path.join(dataDirectory, "listing-meta.json");
const activityFilePath = path.join(dataDirectory, "activity.json");

function detectStaticRoot() {
  const candidates = [__dirname, process.cwd()];
  for (const candidate of candidates) {
    if (fsSync.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return __dirname;
}

const staticRoot = detectStaticRoot();
const defaultSeedCreatedAt = new Date().toISOString();

const defaultItems = [
  {
    id: "seed-desk-lamp",
    name: "Desk Lamp",
    price: 25,
    description: "Dimmable desk lamp in great condition.",
    mainImage:
      "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=900&q=80",
    extraImages: [],
    status: "available",
    ownerName: "",
    createdAt: defaultSeedCreatedAt,
  },
  {
    id: "seed-bookshelf",
    name: "Bookshelf",
    price: 60,
    description: "Sturdy 5-shelf unit, minor wear.",
    mainImage:
      "https://images.unsplash.com/photo-1532372576444-dda954194ad0?auto=format&fit=crop&w=900&q=80",
    extraImages: [],
    status: "available",
    ownerName: "",
    createdAt: defaultSeedCreatedAt,
  },
];

let fileItemsCache = null;
let usersCache = null;
let listingMetaCache = null;
let activityCache = null;
let storageMode = "file";
let storageInitPromise = null;
let authStoreInitPromise = null;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(staticRoot));

function normalizeEnv(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeRole(value) {
  const role = normalizeString(value).toLowerCase();
  return AUTH_ROLES.has(role) ? role : "";
}

function normalizeStatus(value) {
  return value === "bought" || value === "hold" || value === "available" ? value : "available";
}

function normalizePrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
}

function normalizeExtraImages(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "string");
}

function normalizeTimestamp(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString();
}

function isValidImageList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function toApiItem(item) {
  const status = normalizeStatus(item?.status);
  const normalized = {
    id: normalizeString(item?.id) || crypto.randomUUID(),
    name: normalizeString(item?.name),
    price: normalizePrice(item?.price) ?? 0,
    description: normalizeString(item?.description),
    mainImage: normalizeString(item?.mainImage),
    extraImages: normalizeExtraImages(item?.extraImages),
    status,
    ownerName: normalizeString(item?.ownerName),
    createdAt: normalizeTimestamp(item?.createdAt),
  };
  if (normalized.status === "available") {
    normalized.ownerName = "";
  }
  return normalized;
}

function fromSupabaseRecord(record) {
  const extraImages = Array.isArray(record?.extra_images)
    ? record.extra_images
    : typeof record?.extra_images === "string"
    ? (() => {
        try {
          const parsed = JSON.parse(record.extra_images);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
    : [];

  return toApiItem({
    id: record?.id,
    name: record?.name,
    price: record?.price,
    description: record?.description,
    mainImage: record?.main_image,
    extraImages,
    status: record?.status,
    ownerName: record?.owner_name,
    createdAt: record?.created_at,
  });
}

function toSupabasePayload(patch) {
  const payload = {};
  if (patch.id !== undefined) {
    payload.id = normalizeString(patch.id);
  }
  if (patch.name !== undefined) {
    payload.name = normalizeString(patch.name);
  }
  if (patch.price !== undefined) {
    payload.price = normalizePrice(patch.price);
  }
  if (patch.description !== undefined) {
    payload.description = normalizeString(patch.description);
  }
  if (patch.mainImage !== undefined) {
    payload.main_image = normalizeString(patch.mainImage);
  }
  if (patch.extraImages !== undefined) {
    payload.extra_images = normalizeExtraImages(patch.extraImages);
  }
  if (patch.status !== undefined) {
    payload.status = normalizeStatus(patch.status);
  }
  if (patch.ownerName !== undefined) {
    payload.owner_name = normalizeString(patch.ownerName);
  }
  if (patch.createdAt !== undefined) {
    payload.created_at = normalizeTimestamp(patch.createdAt) || null;
  }
  return payload;
}

function formatSupabaseError(payload, statusCode) {
  const message =
    payload?.message ||
    payload?.error ||
    payload?.hint ||
    payload?.details ||
    `Supabase request failed (${statusCode})`;
  return String(message);
}

async function supabaseRequest({ method = "GET", queryPath, body, preferRepresentation = false }) {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
  if (preferRepresentation) {
    headers.Prefer = "return=representation";
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${queryPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(formatSupabaseError(payload, response.status));
  }

  return payload;
}

function parseOffer(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function parseCookies(req) {
  const cookieHeader = normalizeString(req.headers?.cookie);
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce((accumulator, pair) => {
    const [keyPart, ...valueParts] = pair.split("=");
    const key = normalizeString(keyPart);
    if (!key) {
      return accumulator;
    }
    accumulator[key] = decodeURIComponent(valueParts.join("=") || "");
    return accumulator;
  }, {});
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = normalizeString(storedHash).split(":");
  if (!salt || !hash) {
    return false;
  }
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

function createSessionToken(userId) {
  const payload = {
    userId,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token) {
  const rawToken = normalizeString(token);
  if (!rawToken.includes(".")) {
    return null;
  }
  const [encodedPayload, signature] = rawToken.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }
  const expectedSignature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload?.userId || !payload?.exp || Number(payload.exp) < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function applySessionCookie(res, userId) {
  const sessionToken = createSessionToken(userId);
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(
      sessionToken
    )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureAttribute}`
  );
}

function clearSessionCookie(res) {
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute}`
  );
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    phone: user.phone || "",
    createdAt: user.createdAt,
  };
}

async function ensureJsonFile(filePath, defaultValue) {
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
  }
}

async function ensureDataFile() {
  await ensureJsonFile(dataFilePath, defaultItems);
}

async function ensureAuthStoreInitialized() {
  if (!authStoreInitPromise) {
    authStoreInitPromise = (async () => {
      await ensureJsonFile(usersFilePath, []);
      await ensureJsonFile(listingMetaFilePath, {});
      await ensureJsonFile(activityFilePath, []);
    })().catch((error) => {
      authStoreInitPromise = null;
      throw error;
    });
  }
  return authStoreInitPromise;
}

async function readFileItems() {
  if (fileItemsCache) {
    return fileItemsCache;
  }
  const raw = await fs.readFile(dataFilePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Item store is invalid.");
  }
  fileItemsCache = parsed.map(toApiItem);
  return fileItemsCache;
}

async function writeFileItems(items) {
  fileItemsCache = items.map(toApiItem);
  await fs.writeFile(dataFilePath, JSON.stringify(fileItemsCache, null, 2), "utf8");
}

async function readUsers() {
  if (usersCache) {
    return usersCache;
  }
  const raw = await fs.readFile(usersFilePath, "utf8");
  const parsed = JSON.parse(raw);
  usersCache = Array.isArray(parsed) ? parsed : [];
  return usersCache;
}

async function writeUsers(users) {
  usersCache = users;
  await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), "utf8");
}

async function readListingMeta() {
  if (listingMetaCache) {
    return listingMetaCache;
  }
  const raw = await fs.readFile(listingMetaFilePath, "utf8");
  const parsed = JSON.parse(raw);
  listingMetaCache = parsed && typeof parsed === "object" ? parsed : {};
  return listingMetaCache;
}

async function writeListingMeta(meta) {
  listingMetaCache = meta;
  await fs.writeFile(listingMetaFilePath, JSON.stringify(meta, null, 2), "utf8");
}

async function readActivity() {
  if (activityCache) {
    return activityCache;
  }
  const raw = await fs.readFile(activityFilePath, "utf8");
  const parsed = JSON.parse(raw);
  activityCache = Array.isArray(parsed) ? parsed : [];
  return activityCache;
}

async function writeActivity(entries) {
  activityCache = entries;
  await fs.writeFile(activityFilePath, JSON.stringify(entries, null, 2), "utf8");
}

async function recordActivity(entry) {
  const activities = await readActivity();
  activities.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  });
  if (activities.length > 5000) {
    activities.length = 5000;
  }
  await writeActivity(activities);
}

async function findUserByEmail(email) {
  const users = await readUsers();
  const normalized = normalizeEmail(email);
  return users.find((user) => normalizeEmail(user.email) === normalized) || null;
}

async function findUserById(userId) {
  const users = await readUsers();
  return users.find((user) => normalizeString(user.id) === normalizeString(userId)) || null;
}

async function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) {
    return null;
  }
  const payload = parseSessionToken(sessionToken);
  if (!payload) {
    return null;
  }
  return findUserById(payload.userId);
}

function canEditListing(user, listingMetaEntry) {
  if (!user || user.role !== "seller") {
    return false;
  }
  return normalizeString(listingMetaEntry?.creatorId) === normalizeString(user.id);
}

function attachListingMetadata(items, listingMeta) {
  return items.map((item) => ({
    ...item,
    creatorId: normalizeString(listingMeta[item.id]?.creatorId),
  }));
}

const fileStorage = {
  async listItems() {
    return readFileItems();
  },
  async createItem(itemInput) {
    const items = await readFileItems();
    const newItem = toApiItem({
      id: crypto.randomUUID(),
      ...itemInput,
      status: "available",
      ownerName: "",
      createdAt: new Date().toISOString(),
    });
    items.unshift(newItem);
    await writeFileItems(items);
    return newItem;
  },
  async updateItem(itemId, patch) {
    const items = await readFileItems();
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      return null;
    }
    if (patch.name !== undefined) {
      item.name = normalizeString(patch.name);
    }
    if (patch.description !== undefined) {
      item.description = normalizeString(patch.description);
    }
    if (patch.price !== undefined) {
      item.price = normalizePrice(patch.price);
    }
    if (patch.mainImage !== undefined) {
      item.mainImage = normalizeString(patch.mainImage);
    }
    if (patch.extraImages !== undefined) {
      item.extraImages = normalizeExtraImages(patch.extraImages);
    }
    if (patch.status !== undefined) {
      item.status = normalizeStatus(patch.status);
      if (item.status === "available" && patch.ownerName === undefined) {
        item.ownerName = "";
      }
    }
    if (patch.ownerName !== undefined) {
      item.ownerName = normalizeString(patch.ownerName);
    }

    const normalized = toApiItem(item);
    Object.assign(item, normalized);
    await writeFileItems(items);
    return item;
  },
  async deleteItem(itemId) {
    const items = await readFileItems();
    const nextItems = items.filter((entry) => entry.id !== itemId);
    if (nextItems.length === items.length) {
      return false;
    }
    await writeFileItems(nextItems);
    return true;
  },
  async checkout({ buyerName, selections }) {
    const items = await readFileItems();
    const processed = [];
    const skipped = [];

    selections.forEach((selection) => {
      const itemId = normalizeString(selection?.itemId);
      const offer = parseOffer(selection?.offer);

      const item = items.find((entry) => entry.id === itemId);
      if (!item) {
        skipped.push({ itemId, reason: "Item not found." });
        return;
      }
      if (offer == null) {
        skipped.push({ itemId, itemName: item.name, reason: "Offer is required for hold requests." });
        return;
      }
      if (item.status !== "available") {
        skipped.push({ itemId, itemName: item.name, reason: "Item is no longer available." });
        return;
      }

      item.status = "hold";
      item.ownerName = buyerName;
      processed.push({
        itemId: item.id,
        itemName: item.name,
        action: "hold",
        originalPrice: item.price,
        offer,
      });
    });

    if (processed.length) {
      await writeFileItems(items);
    }

    return { processed, skipped, items };
  },
};

const supabaseStorage = {
  async ensureReady() {
    let rows;
    try {
      rows = await supabaseRequest({
        queryPath: `${SUPABASE_ITEMS_TABLE}?select=id&limit=1`,
      });
    } catch (error) {
      const message = normalizeString(error.message);
      if (message.includes("Could not find the table")) {
        throw new Error(
          `Supabase table "${SUPABASE_ITEMS_TABLE}" was not found. Run supabase-schema.sql or set SUPABASE_ITEMS_TABLE to your existing table name.`
        );
      }
      throw error;
    }

    if (Array.isArray(rows) && rows.length === 0) {
      const seedPayload = defaultItems.map((item) =>
        toSupabasePayload({
          id: item.id,
          name: item.name,
          price: item.price,
          description: item.description,
          mainImage: item.mainImage,
          extraImages: item.extraImages,
          status: item.status,
          ownerName: item.ownerName,
          createdAt: item.createdAt,
        })
      );
      await supabaseRequest({
        method: "POST",
        queryPath: SUPABASE_ITEMS_TABLE,
        body: seedPayload,
      });
    }
  },
  async listItems() {
    const payload = await supabaseRequest({
      queryPath: `${SUPABASE_ITEMS_TABLE}?select=id,name,price,description,main_image,extra_images,status,owner_name,created_at`,
    });
    return Array.isArray(payload) ? payload.map(fromSupabaseRecord) : [];
  },
  async createItem(itemInput) {
    const payload = toSupabasePayload({
      id: crypto.randomUUID(),
      ...itemInput,
      status: "available",
      ownerName: "",
      createdAt: new Date().toISOString(),
    });
    const rows = await supabaseRequest({
      method: "POST",
      queryPath: SUPABASE_ITEMS_TABLE,
      body: payload,
      preferRepresentation: true,
    });
    const created = Array.isArray(rows) ? rows[0] : null;
    if (!created) {
      throw new Error("Supabase did not return the created item.");
    }
    return fromSupabaseRecord(created);
  },
  async updateItem(itemId, patch) {
    const payload = toSupabasePayload(patch);
    if (payload.status === "available" && payload.owner_name === undefined) {
      payload.owner_name = "";
    }
    const rows = await supabaseRequest({
      method: "PATCH",
      queryPath: `${SUPABASE_ITEMS_TABLE}?id=eq.${encodeURIComponent(itemId)}`,
      body: payload,
      preferRepresentation: true,
    });
    const updated = Array.isArray(rows) ? rows[0] : null;
    return updated ? fromSupabaseRecord(updated) : null;
  },
  async deleteItem(itemId) {
    const rows = await supabaseRequest({
      method: "DELETE",
      queryPath: `${SUPABASE_ITEMS_TABLE}?id=eq.${encodeURIComponent(itemId)}`,
      preferRepresentation: true,
    });
    return Array.isArray(rows) ? rows.length > 0 : false;
  },
  async checkout({ buyerName, selections }) {
    const processed = [];
    const skipped = [];

    for (const selection of selections) {
      const itemId = normalizeString(selection?.itemId);
      const offer = parseOffer(selection?.offer);
      if (offer == null) {
        skipped.push({ itemId, reason: "Offer is required for hold requests." });
        continue;
      }

      const updatedRows = await supabaseRequest({
        method: "PATCH",
        queryPath: `${SUPABASE_ITEMS_TABLE}?id=eq.${encodeURIComponent(
          itemId
        )}&status=eq.available`,
        body: {
          status: "hold",
          owner_name: buyerName,
        },
        preferRepresentation: true,
      });

      const updated = Array.isArray(updatedRows) ? updatedRows[0] : null;
      if (updated) {
        const item = fromSupabaseRecord(updated);
        processed.push({
          itemId: item.id,
          itemName: item.name,
          action: "hold",
          originalPrice: item.price,
          offer,
        });
        continue;
      }

      const existingRows = await supabaseRequest({
        queryPath: `${SUPABASE_ITEMS_TABLE}?select=id,name,status&id=eq.${encodeURIComponent(
          itemId
        )}&limit=1`,
      });

      if (!Array.isArray(existingRows) || existingRows.length === 0) {
        skipped.push({ itemId, reason: "Item not found." });
      } else {
        skipped.push({
          itemId,
          itemName: normalizeString(existingRows[0].name),
          reason: "Item is no longer available.",
        });
      }
    }

    const items = await supabaseStorage.listItems();
    return { processed, skipped, items };
  },
};

const storage = {
  mode: "file",
  async init() {
    if (isSupabaseConfigured()) {
      await supabaseStorage.ensureReady();
      this.mode = "supabase";
      storageMode = "supabase";
      console.log("Using Supabase storage.");
      return;
    }
    await ensureDataFile();
    this.mode = "file";
    storageMode = "file";
    console.log("Using local JSON file storage.");
  },
  async listItems() {
    return this.mode === "supabase" ? supabaseStorage.listItems() : fileStorage.listItems();
  },
  async createItem(itemInput) {
    return this.mode === "supabase"
      ? supabaseStorage.createItem(itemInput)
      : fileStorage.createItem(itemInput);
  },
  async updateItem(itemId, patch) {
    return this.mode === "supabase"
      ? supabaseStorage.updateItem(itemId, patch)
      : fileStorage.updateItem(itemId, patch);
  },
  async deleteItem(itemId) {
    return this.mode === "supabase"
      ? supabaseStorage.deleteItem(itemId)
      : fileStorage.deleteItem(itemId);
  },
  async checkout(payload) {
    return this.mode === "supabase"
      ? supabaseStorage.checkout(payload)
      : fileStorage.checkout(payload);
  },
};

function ensureStorageInitialized() {
  if (!storageInitPromise) {
    storageInitPromise = storage.init().catch((error) => {
      storageInitPromise = null;
      throw error;
    });
  }
  return storageInitPromise;
}

async function getProfileSummary(user) {
  const [items, listingMeta, activities] = await Promise.all([
    storage.listItems(),
    readListingMeta(),
    readActivity(),
  ]);
  const userId = normalizeString(user.id);

  const itemsCreatedCount = items.filter(
    (item) => normalizeString(listingMeta[item.id]?.creatorId) === userId
  ).length;
  const itemsSoldCount = items.filter(
    (item) =>
      item.status === "bought" && normalizeString(listingMeta[item.id]?.creatorId) === userId
  ).length;
  const itemsOnHoldForYouCount = items.filter(
    (item) => item.status === "hold" && normalizeString(listingMeta[item.id]?.holderId) === userId
  ).length;
  const itemsBoughtCount = items.filter(
    (item) =>
      item.status === "bought" && normalizeString(listingMeta[item.id]?.buyerId) === userId
  ).length;
  const holdRequestsSubmittedCount = activities.filter(
    (entry) => entry.userId === userId && entry.type === "checkout-hold-submitted"
  ).length;

  const recentActivities = activities.filter((entry) => entry.userId === userId).slice(0, 30);

  return {
    summary: {
      itemsCreatedCount,
      itemsSoldCount,
      itemsOnHoldForYouCount,
      itemsBoughtCount,
      holdRequestsSubmittedCount,
    },
    canManageAllListings: false,
    recentActivities,
  };
}

app.use(async (req, res, next) => {
  try {
    await ensureStorageInitialized();
    await ensureAuthStoreInitialized();
    req.user = await getCurrentUser(req);
    next();
  } catch (error) {
    console.error("Initialization failed:", error);
    res.status(500).json({ error: "Server initialization failed." });
  }
});

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }
  return next();
}

function requireSeller(req, res, next) {
  if (!req.user || req.user.role !== "seller") {
    return res.status(403).json({ error: "Seller account required." });
  }
  return next();
}

app.post("/api/auth/signup", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizeString(req.body?.password);
  const displayName = normalizeString(req.body?.displayName);
  const phone = normalizeString(req.body?.phone);
  const role = normalizeRole(req.body?.role);

  if (!email || !password || !displayName || !role) {
    return res.status(400).json({ error: "Email, password, display name, and role are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const users = await readUsers();
    const user = {
      id: crypto.randomUUID(),
      email,
      passwordHash: createPasswordHash(password),
      role,
      displayName,
      phone,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeUsers(users);
    applySessionCookie(res, user.id);
    await recordActivity({
      userId: user.id,
      type: "account-created",
    });
    return res.status(201).json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/signin", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizeString(req.body?.password);
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    applySessionCookie(res, user.id);
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not sign in." });
  }
});

app.post("/api/auth/signout", (req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false, user: null });
  }
  return res.json({ authenticated: true, user: sanitizeUser(req.user) });
});

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const profile = await getProfileSummary(req.user);
    return res.json({
      user: sanitizeUser(req.user),
      profile,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not load profile." });
  }
});

app.get("/api/items", async (_req, res) => {
  try {
    const [items, listingMeta] = await Promise.all([storage.listItems(), readListingMeta()]);
    return res.json({ items: attachListingMetadata(items, listingMeta) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load items." });
  }
});

app.post("/api/items", requireSeller, async (req, res) => {
  const name = normalizeString(req.body?.name);
  const description = normalizeString(req.body?.description);
  const mainImage = normalizeString(req.body?.mainImage);
  const price = normalizePrice(req.body?.price);
  const extraImages = req.body?.extraImages;

  if (!name || !description || price == null) {
    return res
      .status(400)
      .json({ error: "Name, description, and a valid price are required." });
  }
  if (extraImages && !isValidImageList(extraImages)) {
    return res.status(400).json({ error: "Extra images must be a string array." });
  }

  try {
    const item = await storage.createItem({
      name,
      description,
      mainImage,
      price,
      extraImages: extraImages || [],
    });

    const listingMeta = await readListingMeta();
    listingMeta[item.id] = {
      creatorId: req.user.id,
      holderId: "",
      buyerId: "",
    };
    await writeListingMeta(listingMeta);

    await recordActivity({
      userId: req.user.id,
      type: "item-created",
      itemId: item.id,
      itemName: item.name,
    });

    const items = attachListingMetadata(await storage.listItems(), listingMeta);
    return res.status(201).json({ item: { ...item, creatorId: req.user.id }, items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not create item." });
  }
});

app.put("/api/items/:itemId", requireSeller, async (req, res) => {
  const itemId = normalizeString(req.params.itemId);
  const listingMeta = await readListingMeta();
  const metaEntry = listingMeta[itemId] || { creatorId: "", holderId: "", buyerId: "" };
  if (!canEditListing(req.user, metaEntry)) {
    return res.status(403).json({ error: "You can only edit your own listings." });
  }

  const patch = {};
  if (req.body?.name != null) {
    const name = normalizeString(req.body.name);
    if (!name) {
      return res.status(400).json({ error: "Item name cannot be empty." });
    }
    patch.name = name;
  }
  if (req.body?.description != null) {
    const description = normalizeString(req.body.description);
    if (!description) {
      return res.status(400).json({ error: "Description cannot be empty." });
    }
    patch.description = description;
  }
  if (req.body?.price != null) {
    const price = normalizePrice(req.body.price);
    if (price == null) {
      return res.status(400).json({ error: "Price must be a valid number." });
    }
    patch.price = price;
  }
  if (req.body?.mainImage != null) {
    patch.mainImage = normalizeString(req.body.mainImage);
  }
  if (req.body?.extraImages != null) {
    if (!isValidImageList(req.body.extraImages)) {
      return res.status(400).json({ error: "Extra images must be a string array." });
    }
    patch.extraImages = req.body.extraImages;
  }
  if (req.body?.status != null) {
    patch.status = normalizeStatus(req.body.status);
  }
  if (req.body?.ownerName != null) {
    patch.ownerName = normalizeString(req.body.ownerName);
  }

  try {
    const item = await storage.updateItem(itemId, patch);
    if (!item) {
      return res.status(404).json({ error: "Item not found." });
    }

    if (patch.status === "available") {
      metaEntry.holderId = "";
      metaEntry.buyerId = "";
    } else if (patch.status === "bought") {
      metaEntry.buyerId = metaEntry.holderId || metaEntry.buyerId || "";
    }
    listingMeta[itemId] = metaEntry;
    await writeListingMeta(listingMeta);

    await recordActivity({
      userId: req.user.id,
      type: "item-updated",
      itemId: item.id,
      itemName: item.name,
    });

    const items = attachListingMetadata(await storage.listItems(), listingMeta);
    return res.json({ item: { ...item, creatorId: normalizeString(metaEntry.creatorId) }, items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not update item." });
  }
});

app.delete("/api/items/:itemId", requireSeller, async (req, res) => {
  const itemId = normalizeString(req.params.itemId);
  const listingMeta = await readListingMeta();
  const metaEntry = listingMeta[itemId] || { creatorId: "", holderId: "", buyerId: "" };
  if (!canEditListing(req.user, metaEntry)) {
    return res.status(403).json({ error: "You can only delete your own listings." });
  }

  try {
    const deleted = await storage.deleteItem(itemId);
    if (!deleted) {
      return res.status(404).json({ error: "Item not found." });
    }
    delete listingMeta[itemId];
    await writeListingMeta(listingMeta);
    await recordActivity({
      userId: req.user.id,
      type: "item-deleted",
      itemId,
    });
    const items = attachListingMetadata(await storage.listItems(), listingMeta);
    return res.json({ items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not delete item." });
  }
});

app.post("/api/checkout", requireAuth, async (req, res) => {
  const buyerName = normalizeString(req.body?.buyerName) || normalizeString(req.user?.displayName);
  const buyerPhone = normalizeString(req.body?.buyerPhone) || normalizeString(req.user?.phone);
  const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];

  if (!buyerName || !buyerPhone) {
    return res.status(400).json({ error: "Buyer name and phone number are required." });
  }
  if (!selections.length) {
    return res.status(400).json({ error: "No items were selected for checkout." });
  }

  try {
    const checkoutResult = await storage.checkout({
      buyerName,
      selections,
    });

    if (!checkoutResult.processed.length) {
      const items = attachListingMetadata(checkoutResult.items, await readListingMeta());
      return res.status(409).json({
        error: "None of the selected items are available anymore.",
        processed: checkoutResult.processed,
        skipped: checkoutResult.skipped,
        items,
      });
    }

    const listingMeta = await readListingMeta();
    for (const entry of checkoutResult.processed) {
      const itemId = normalizeString(entry.itemId);
      const current = listingMeta[itemId] || { creatorId: "", holderId: "", buyerId: "" };
      current.holderId = req.user.id;
      current.buyerId = "";
      listingMeta[itemId] = current;
      await recordActivity({
        userId: req.user.id,
        type: "checkout-hold-submitted",
        itemId,
        itemName: normalizeString(entry.itemName),
        offer: entry.offer,
      });
    }
    await writeListingMeta(listingMeta);

    const items = attachListingMetadata(checkoutResult.items, listingMeta);
    return res.json({
      buyerName,
      buyerPhone,
      processed: checkoutResult.processed,
      skipped: checkoutResult.skipped,
      items,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Checkout failed." });
  }
});

app.get("/signin", (_req, res) => {
  res.sendFile(path.join(staticRoot, "signin.html"));
});

app.get("/profile", (_req, res) => {
  res.sendFile(path.join(staticRoot, "profile.html"));
});

app.get("/seller", (_req, res) => {
  res.sendFile(path.join(staticRoot, "seller.html"));
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found." });
  }

  if (path.extname(req.path)) {
    return res.status(404).send("Not found.");
  }

  return res.sendFile(path.join(staticRoot, "index.html"));
});

async function start() {
  await ensureStorageInitialized();
  await ensureAuthStoreInitialized();
  app.listen(PORT, () => {
    console.log(`Move-out sale site is running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Unable to start server:", error);
    process.exit(1);
  });
}

module.exports = app;
