const express = require("express");
const path = require("path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_SELLER_PASSWORD = "change-this-password";
const SELLER_PASSWORD = process.env.SELLER_PASSWORD || DEFAULT_SELLER_PASSWORD;
const sellerSessions = new Set();

const dataDirectory = path.join(__dirname, "data");
const dataFilePath = path.join(dataDirectory, "items.json");

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

let itemsCache = null;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(__dirname));

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

function isValidImageList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

async function ensureDataFile() {
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.access(dataFilePath);
  } catch {
    await fs.writeFile(dataFilePath, JSON.stringify(defaultItems, null, 2), "utf8");
  }
}

async function readItems() {
  if (itemsCache) {
    return itemsCache;
  }
  const raw = await fs.readFile(dataFilePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Item store is invalid.");
  }
  itemsCache = parsed;
  return itemsCache;
}

async function writeItems(items) {
  itemsCache = items;
  const payload = JSON.stringify(items, null, 2);
  await fs.writeFile(dataFilePath, payload, "utf8");
}

function requireSeller(req, res, next) {
  const token = req.header("x-seller-token");
  if (!token || !sellerSessions.has(token)) {
    return res.status(401).json({ error: "Seller access required." });
  }
  return next();
}

app.get("/api/items", async (_req, res) => {
  try {
    const items = await readItems();
    res.json({ items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load items." });
  }
});

app.get("/api/seller-config", (_req, res) => {
  const usingDefaultPassword = SELLER_PASSWORD === DEFAULT_SELLER_PASSWORD;
  res.json({
    usingDefaultPassword,
    hint: usingDefaultPassword
      ? "Server is using the default seller password. Change SELLER_PASSWORD in your environment."
      : "Seller password is configured.",
  });
});

app.post("/api/seller-auth", (req, res) => {
  const password = normalizeString(req.body?.password);
  if (!password || password !== SELLER_PASSWORD) {
    return res.status(401).json({ error: "Seller password is incorrect." });
  }
  const token = crypto.randomUUID();
  sellerSessions.add(token);
  return res.json({ ok: true, token });
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
    const items = await readItems();
    const newItem = {
      id: crypto.randomUUID(),
      name,
      price,
      description,
      mainImage,
      extraImages: extraImages || [],
      status: "available",
      ownerName: "",
    };

    items.unshift(newItem);
    await writeItems(items);
    res.status(201).json({ item: newItem, items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create item." });
  }
});

app.put("/api/items/:itemId", requireSeller, async (req, res) => {
  try {
    const items = await readItems();
    const item = items.find((entry) => entry.id === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: "Item not found." });
    }

    if (req.body?.name != null) {
      const name = normalizeString(req.body.name);
      if (!name) {
        return res.status(400).json({ error: "Item name cannot be empty." });
      }
      item.name = name;
    }

    if (req.body?.description != null) {
      const description = normalizeString(req.body.description);
      if (!description) {
        return res.status(400).json({ error: "Description cannot be empty." });
      }
      item.description = description;
    }

    if (req.body?.price != null) {
      const price = normalizePrice(req.body.price);
      if (price == null) {
        return res.status(400).json({ error: "Price must be a valid number." });
      }
      item.price = price;
    }

    if (req.body?.mainImage != null) {
      item.mainImage = normalizeString(req.body.mainImage);
    }

    if (req.body?.extraImages != null) {
      if (!isValidImageList(req.body.extraImages)) {
        return res.status(400).json({ error: "Extra images must be a string array." });
      }
      item.extraImages = req.body.extraImages;
    }

    if (req.body?.status != null) {
      item.status = normalizeStatus(req.body.status);
    }

    if (req.body?.ownerName != null) {
      item.ownerName = normalizeString(req.body.ownerName);
    }

    if (item.status === "available" && req.body?.ownerName == null) {
      item.ownerName = "";
    }

    await writeItems(items);
    return res.json({ item, items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not update item." });
  }
});

app.delete("/api/items/:itemId", requireSeller, async (req, res) => {
  try {
    const items = await readItems();
    const nextItems = items.filter((entry) => entry.id !== req.params.itemId);
    if (nextItems.length === items.length) {
      return res.status(404).json({ error: "Item not found." });
    }
    await writeItems(nextItems);
    return res.json({ items: nextItems });
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
    const items = await readItems();
    const processed = [];
    const skipped = [];

    selections.forEach((selection) => {
      const itemId = normalizeString(selection?.itemId);
      const action = selection?.action === "hold" ? "hold" : "bought";
      const offerValue = selection?.offer;
      const offer =
        offerValue == null || offerValue === ""
          ? null
          : Number.isFinite(Number(offerValue)) && Number(offerValue) >= 0
          ? Number(offerValue)
          : null;

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

    if (!processed.length) {
      return res.status(409).json({
        error: "None of the selected items are available anymore.",
        processed,
        skipped,
        items,
      });
    }

    await writeItems(items);
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

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

async function start() {
  await ensureDataFile();
  app.listen(PORT, () => {
    console.log(`Move-out sale site is running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Unable to start server:", error);
  process.exit(1);
});
