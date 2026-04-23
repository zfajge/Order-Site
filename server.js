const express = require("express");
const path = require("path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const crypto = require("node:crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_SELLER_PASSWORD = "Thunder235911!!";
const SELLER_PASSWORD = process.env.SELLER_PASSWORD || DEFAULT_SELLER_PASSWORD;
const SUPABASE_URL = normalizeEnv(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
const SUPABASE_ITEMS_TABLE = normalizeEnv(process.env.SUPABASE_ITEMS_TABLE) || "moveout_items";

const dataDirectory = path.join(__dirname, "data");
const dataFilePath = path.join(dataDirectory, "items.json");

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
  },
];

let fileItemsCache = null;
let storageMode = "file";
let storageInitPromise = null;

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

function normalizeStatus(value) {
  return value === "bought" || value === "hold" || value === "available"
    ? value
    : "available";
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

async function ensureDataFile() {
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.access(dataFilePath);
  } catch {
    await fs.writeFile(dataFilePath, JSON.stringify(defaultItems, null, 2), "utf8");
  }
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
  const payload = JSON.stringify(fileItemsCache, null, 2);
  await fs.writeFile(dataFilePath, payload, "utf8");
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
      const action = selection?.action === "hold" ? "hold" : "bought";
      const offer = parseOffer(selection?.offer);

      const item = items.find((entry) => entry.id === itemId);
      if (!item) {
        skipped.push({ itemId, reason: "Item not found." });
        return;
      }
      if (item.status !== "available") {
        skipped.push({ itemId, itemName: item.name, reason: "Item is no longer available." });
        return;
      }

      item.status = action;
      item.ownerName = buyerName;
      processed.push({
        itemId: item.id,
        itemName: item.name,
        action,
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
      queryPath: `${SUPABASE_ITEMS_TABLE}?select=id,name,price,description,main_image,extra_images,status,owner_name`,
    });
    return Array.isArray(payload) ? payload.map(fromSupabaseRecord) : [];
  },
  async createItem(itemInput) {
    const payload = toSupabasePayload({
      id: crypto.randomUUID(),
      ...itemInput,
      status: "available",
      ownerName: "",
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
      const action = selection?.action === "hold" ? "hold" : "bought";
      const offer = parseOffer(selection?.offer);

      const updatedRows = await supabaseRequest({
        method: "PATCH",
        queryPath: `${SUPABASE_ITEMS_TABLE}?id=eq.${encodeURIComponent(
          itemId
        )}&status=eq.available`,
        body: {
          status: action,
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
          action,
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

app.use(async (_req, res, next) => {
  try {
    await ensureStorageInitialized();
    next();
  } catch (error) {
    console.error("Storage initialization failed:", error);
    res.status(500).json({ error: "Storage initialization failed." });
  }
});

function requireSeller(req, res, next) {
  const password = normalizeString(req.header("x-seller-password"));
  if (!password || password !== SELLER_PASSWORD) {
    return res.status(401).json({ error: "Seller access required." });
  }
  return next();
}

app.get("/api/items", async (_req, res) => {
  try {
    const items = await storage.listItems();
    res.json({ items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load items." });
  }
});

app.get("/api/seller-config", (_req, res) => {
  const usingDefaultPassword = SELLER_PASSWORD === DEFAULT_SELLER_PASSWORD;
  const storageHint =
    storageMode === "supabase"
      ? "Inventory is backed by Supabase."
      : "Inventory is backed by local JSON file storage.";

  res.json({
    usingDefaultPassword,
    storageMode,
    hint: usingDefaultPassword
      ? `Server is using the default seller password. ${storageHint}`
      : `Seller password is configured. ${storageHint}`,
  });
});

app.post("/api/seller-auth", (req, res) => {
  const password = normalizeString(req.body?.password);
  if (!password || password !== SELLER_PASSWORD) {
    return res.status(401).json({ error: "Seller password is incorrect." });
  }
  return res.json({ ok: true });
});

app.post("/api/seller-logout", (req, res) => {
  return res.json({ ok: true });
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
    const items = await storage.listItems();
    res.status(201).json({ item, items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create item." });
  }
});

app.put("/api/items/:itemId", requireSeller, async (req, res) => {
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
    const item = await storage.updateItem(req.params.itemId, patch);
    if (!item) {
      return res.status(404).json({ error: "Item not found." });
    }
    const items = await storage.listItems();
    return res.json({ item, items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not update item." });
  }
});

app.delete("/api/items/:itemId", requireSeller, async (req, res) => {
  try {
    const deleted = await storage.deleteItem(req.params.itemId);
    if (!deleted) {
      return res.status(404).json({ error: "Item not found." });
    }
    const items = await storage.listItems();
    return res.json({ items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not delete item." });
  }
});

app.post("/api/checkout", async (req, res) => {
  const buyerName = normalizeString(req.body?.buyerName);
  const buyerPhone = normalizeString(req.body?.buyerPhone);
  const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];

  if (!buyerName || !buyerPhone) {
    return res.status(400).json({ error: "Buyer name and phone number are required." });
  }
  if (!selections.length) {
    return res.status(400).json({ error: "No items were selected for checkout." });
  }

  try {
    const { processed, skipped, items } = await storage.checkout({
      buyerName,
      selections,
    });

    if (!processed.length) {
      return res.status(409).json({
        error: "None of the selected items are available anymore.",
        processed,
        skipped,
        items,
      });
    }

    return res.json({
      buyerName,
      buyerPhone,
      processed,
      skipped,
      items,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Checkout failed." });
  }
});

app.get("/seller", (_req, res) => {
  res.redirect(302, "/seller.html");
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found." });
  }

  // Do not mask missing asset paths with index.html.
  if (path.extname(req.path)) {
    return res.status(404).send("Not found.");
  }

  return res.sendFile(path.join(staticRoot, "index.html"));
});

async function start() {
  await ensureStorageInitialized();
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
