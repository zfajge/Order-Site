const API_BASE = "/api";
const IMAGE_MAX_DIMENSION = 1400;
const IMAGE_JPEG_QUALITY = 0.82;
const NEW_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;

const state = {
  sellerToken: "",
  sellerPassword: "",
  editingItemId: null,
  items: [],
};

const sellerUnlockForm = document.getElementById("seller-unlock-form");
const sellerPasswordInput = document.getElementById("seller-password");
const sellerUnlockMessage = document.getElementById("seller-unlock-message");
const sellerPanel = document.getElementById("seller-panel");
const sellerLockBtn = document.getElementById("seller-lock-btn");
const sellerStatusPill = document.getElementById("seller-status-pill");

const itemForm = document.getElementById("item-form");
const itemFormTitle = document.getElementById("item-form-title");
const itemSubmitBtn = document.getElementById("item-submit-btn");
const itemCancelEditBtn = document.getElementById("item-cancel-edit-btn");
const itemFormMessage = document.getElementById("item-form-message");
const itemNameInput = document.getElementById("item-name");
const itemPriceInput = document.getElementById("item-price");
const itemDescriptionInput = document.getElementById("item-description");
const itemMainImageUrlInput = document.getElementById("item-main-image-url");
const itemMainImageFileInput = document.getElementById("item-main-image-file");
const itemExtraImagesUrlsInput = document.getElementById("item-extra-images-urls");
const itemExtraImagesFilesInput = document.getElementById("item-extra-images-files");
const itemsGrid = document.getElementById("items-grid");
const itemCardTemplate = document.getElementById("item-card-template");
const itemDetailModal = document.getElementById("item-detail-modal");
const itemDetailCloseBtn = document.getElementById("item-detail-close-btn");
const itemDetailTitle = document.getElementById("item-detail-title");
const itemDetailPrice = document.getElementById("item-detail-price");
const itemDetailDescription = document.getElementById("item-detail-description");
const itemDetailOwner = document.getElementById("item-detail-owner");
const itemDetailMainImage = document.getElementById("item-detail-main-image");
const itemDetailGallery = document.getElementById("item-detail-gallery");

function isSellerUnlocked() {
  return Boolean(state.sellerPassword || state.sellerToken);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatPrice(price) {
  return `$${Number(price).toFixed(2)}`;
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setCardDescription(element, text) {
  element.textContent = text;
  element.setAttribute("title", text);
}

function isItemNew(item) {
  if (!item || typeof item.createdAt !== "string") {
    return false;
  }
  const createdAtMs = Date.parse(item.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }
  return Date.now() - createdAtMs <= NEW_BADGE_WINDOW_MS;
}

function getStatusLabel(status) {
  if (status === "bought") {
    return "Bought";
  }
  if (status === "hold") {
    return "On Hold";
  }
  return "Available";
}

function getCombinedImages(item) {
  const images = [];
  if (typeof item.mainImage === "string" && item.mainImage.trim()) {
    images.push(item.mainImage.trim());
  }
  if (Array.isArray(item.extraImages)) {
    item.extraImages.forEach((entry) => {
      if (typeof entry === "string" && entry.trim()) {
        images.push(entry.trim());
      }
    });
  }
  return images.length
    ? images
    : ["https://via.placeholder.com/1200x800?text=Item+Photo+Not+Available"];
}

function getItemById(itemId) {
  return state.items.find((item) => item.id === itemId);
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (state.sellerToken) {
    headers["x-seller-token"] = state.sellerToken;
  }
  if (state.sellerPassword) {
    headers["x-seller-password"] = state.sellerPassword;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  }

  if (!response.ok) {
    let message = payload?.error || `Request failed (${response.status})`;
    if (response.status === 413) {
      message =
        "Upload is too large (413). Use fewer/smaller images or lower-resolution photos.";
    }
    throw new Error(message);
  }

  return payload;
}

async function refreshItems() {
  const payload = await apiRequest("/items");
  state.items = Array.isArray(payload?.items) ? payload.items : [];
}

function updateSellerUi() {
  const unlocked = isSellerUnlocked();
  sellerPanel.classList.toggle("hidden", !unlocked);
  sellerLockBtn.classList.toggle("hidden", !unlocked);
  sellerStatusPill.textContent = unlocked ? "Unlocked" : "Locked";
  sellerStatusPill.classList.toggle("status-pill-live", unlocked);
}

function resetItemForm() {
  itemForm.reset();
  state.editingItemId = null;
  itemFormTitle.textContent = "Add Item";
  itemSubmitBtn.textContent = "Add Item";
  itemCancelEditBtn.classList.add("hidden");
}

function fillItemFormForEdit(item) {
  itemNameInput.value = item.name;
  itemPriceInput.value = item.price;
  itemDescriptionInput.value = item.description;
  itemMainImageUrlInput.value = item.mainImage || "";
  itemExtraImagesUrlsInput.value = (item.extraImages || []).join("\n");
}

async function readImageFileAsDataURL(file) {
  const originalDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });

  if (!file.type.startsWith("image/")) {
    return originalDataUrl;
  }

  const compressedDataUrl = await compressImageDataUrl(originalDataUrl);
  return compressedDataUrl || originalDataUrl;
}

async function compressImageDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(
        1,
        IMAGE_MAX_DIMENSION / Math.max(image.width, image.height)
      );
      const targetWidth = Math.max(1, Math.round(image.width * scale));
      const targetHeight = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      const compressed = canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
      resolve(compressed || dataUrl);
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function collectImages() {
  const mainImageFile = itemMainImageFileInput.files[0];
  const mainImageUrl = normalizeText(itemMainImageUrlInput.value);
  let mainImage = mainImageUrl;
  if (mainImageFile) {
    mainImage = await readImageFileAsDataURL(mainImageFile);
  }

  const extraImages = itemExtraImagesUrlsInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const extraFiles = Array.from(itemExtraImagesFilesInput.files || []);
  for (const file of extraFiles) {
    extraImages.push(await readImageFileAsDataURL(file));
  }

  return { mainImage, extraImages };
}

function renderItems() {
  itemsGrid.innerHTML = "";

  if (!state.items.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No listings yet.";
    itemsGrid.appendChild(empty);
    return;
  }

  const sortedItems = [...state.items].sort((a, b) => {
    const aUnavailable = a.status !== "available" ? 1 : 0;
    const bUnavailable = b.status !== "available" ? 1 : 0;
    if (aUnavailable !== bUnavailable) {
      return aUnavailable - bUnavailable;
    }
    return 0;
  });

  sortedItems.forEach((item) => {
    const fragment = itemCardTemplate.content.cloneNode(true);
    const image = fragment.querySelector(".item-image");
    const title = fragment.querySelector(".item-title");
    const price = fragment.querySelector(".item-price");
    const description = fragment.querySelector(".item-description");
    const ownerNote = fragment.querySelector(".item-owner-note");
    const overlay = fragment.querySelector(".item-overlay");
    const overlayStatus = fragment.querySelector(".overlay-status");
    const overlayOwner = fragment.querySelector(".overlay-owner");
    const editBtn = fragment.querySelector(".edit-item-btn");
    const deleteBtn = fragment.querySelector(".delete-item-btn");
    const markAvailableBtn = fragment.querySelector(".mark-available-btn");
    const markSoldBtn = fragment.querySelector(".mark-sold-btn");
    const galleryWrap = fragment.querySelector(".gallery-thumbs");
    const newBadge = fragment.querySelector(".card-badge");

    image.src =
      item.mainImage || "https://via.placeholder.com/1200x800?text=Item+Photo+Not+Available";
    image.alt = item.name;
    title.textContent = item.name;
    price.textContent = formatPrice(item.price);
    setCardDescription(description, item.description);
    if (newBadge) {
      newBadge.classList.toggle("hidden", !isItemNew(item));
    }

    if (Array.isArray(item.extraImages) && item.extraImages.length > 0) {
      item.extraImages.slice(0, 4).forEach((url, index) => {
        const thumb = document.createElement("img");
        thumb.className = "gallery-thumb";
        thumb.src = url;
        thumb.alt = `${item.name} image ${index + 1}`;
        galleryWrap.appendChild(thumb);
      });
    } else {
      galleryWrap.classList.add("hidden");
    }

    if (item.status === "available") {
      overlay.classList.add("hidden");
      ownerNote.textContent = "Available";
    } else {
      const statusText = getStatusLabel(item.status);
      overlay.classList.remove("hidden");
      overlayStatus.textContent = statusText;
      overlayOwner.textContent = item.ownerName ? `By: ${item.ownerName}` : "";
      ownerNote.textContent = item.ownerName ? `${statusText} by ${item.ownerName}` : statusText;
    }

    editBtn.disabled = !isSellerUnlocked();
    deleteBtn.disabled = !isSellerUnlocked();
    markAvailableBtn.disabled = !isSellerUnlocked();
    markSoldBtn.disabled = !isSellerUnlocked();
    markAvailableBtn.classList.toggle("hidden", item.status === "available");
    markSoldBtn.classList.toggle("hidden", item.status !== "hold");
    markAvailableBtn.textContent =
      item.status === "hold"
        ? "Remove Hold (Mark Available)"
        : "Remove Bought (Mark Available)";
    markSoldBtn.textContent = "Mark as Sold";

    const openDetail = () => showItemDetail(item);
    image.style.cursor = "pointer";
    image.addEventListener("click", openDetail);
    title.style.cursor = "pointer";
    title.addEventListener("click", openDetail);

    editBtn.addEventListener("click", () => {
      if (!isSellerUnlocked()) {
        return;
      }
      state.editingItemId = item.id;
      fillItemFormForEdit(item);
      itemFormTitle.textContent = "Edit Item";
      itemSubmitBtn.textContent = "Save Changes";
      itemCancelEditBtn.classList.remove("hidden");
      setMessage(itemFormMessage, "");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    deleteBtn.addEventListener("click", async () => {
      if (!isSellerUnlocked()) {
        return;
      }
      if (!window.confirm(`Delete "${item.name}"?`)) {
        return;
      }
      try {
        await apiRequest(`/items/${item.id}`, { method: "DELETE" });
        await refreshItems();
        renderItems();
      } catch (error) {
        setMessage(itemFormMessage, error.message, true);
      }
    });

    markAvailableBtn.addEventListener("click", async () => {
      if (!isSellerUnlocked()) {
        return;
      }
      try {
        await apiRequest(`/items/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({
            status: "available",
            ownerName: "",
          }),
        });
        await refreshItems();
        renderItems();
      } catch (error) {
        setMessage(itemFormMessage, error.message, true);
      }
    });

    markSoldBtn.addEventListener("click", async () => {
      if (!isSellerUnlocked() || item.status !== "hold") {
        return;
      }
      try {
        await apiRequest(`/items/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({
            status: "bought",
            ownerName: item.ownerName || "",
          }),
        });
        await refreshItems();
        renderItems();
      } catch (error) {
        setMessage(itemFormMessage, error.message, true);
      }
    });

    itemsGrid.appendChild(fragment);
  });
}

function showItemDetail(item) {
  const images = getCombinedImages(item);
  itemDetailTitle.textContent = item.name;
  itemDetailPrice.textContent = formatPrice(item.price);
  itemDetailDescription.textContent = item.description;
  itemDetailMainImage.src = images[0];
  itemDetailMainImage.alt = item.name;
  itemDetailOwner.textContent =
    item.status === "available"
      ? "Available"
      : `${getStatusLabel(item.status)}${
          item.ownerName ? ` by ${item.ownerName}` : ""
        }`;

  itemDetailGallery.innerHTML = "";
  images.forEach((imageUrl, index) => {
    const full = document.createElement("img");
    full.className = "detail-gallery-image";
    full.src = imageUrl;
    full.alt = `${item.name} full photo ${index + 1}`;
    itemDetailGallery.appendChild(full);
  });

  itemDetailModal.classList.remove("hidden");
}

function closeItemDetailModal() {
  itemDetailModal.classList.add("hidden");
}

async function unlockSeller(event) {
  event.preventDefault();
  const password = normalizeText(sellerPasswordInput.value);
  if (!password) {
    setMessage(sellerUnlockMessage, "Please enter the seller password.", true);
    return;
  }

  try {
    const payload = await apiRequest("/seller-auth", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    state.sellerToken = payload?.token || "password-auth";
    state.sellerPassword = password;
    sellerUnlockForm.reset();
    setMessage(sellerUnlockMessage, "Seller controls unlocked.");
    updateSellerUi();
    await refreshItems();
    renderItems();
  } catch (error) {
    setMessage(sellerUnlockMessage, error.message, true);
  }
}

function lockSeller() {
  state.sellerPassword = "";
  state.sellerToken = "";
  resetItemForm();
  updateSellerUi();
  renderItems();
  setMessage(sellerUnlockMessage, "Seller controls locked.");
}

async function handleItemSubmit(event) {
  event.preventDefault();
  setMessage(itemFormMessage, "");

  if (!isSellerUnlocked()) {
    setMessage(itemFormMessage, "Unlock seller controls first.", true);
    return;
  }

  const name = normalizeText(itemNameInput.value);
  const description = normalizeText(itemDescriptionInput.value);
  const price = Number(itemPriceInput.value);

  if (!name || !description || !Number.isFinite(price) || price < 0) {
    setMessage(itemFormMessage, "Please enter a valid name, description, and price.", true);
    return;
  }

  try {
    const { mainImage, extraImages } = await collectImages();

    if (state.editingItemId) {
      const current = getItemById(state.editingItemId);
      await apiRequest(`/items/${state.editingItemId}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          description,
          price,
          mainImage,
          extraImages,
          status: current?.status || "available",
          ownerName: current?.ownerName || "",
        }),
      });
      setMessage(itemFormMessage, "Item updated.");
    } else {
      await apiRequest("/items", {
        method: "POST",
        body: JSON.stringify({ name, description, price, mainImage, extraImages }),
      });
      setMessage(itemFormMessage, "Item added.");
    }

    await refreshItems();
    renderItems();
    resetItemForm();
  } catch (error) {
    setMessage(itemFormMessage, error.message, true);
  }
}

function cancelEdit() {
  resetItemForm();
  setMessage(itemFormMessage, "");
}

function closeDetailOnBackdrop(event) {
  if (event.target === itemDetailModal) {
    closeItemDetailModal();
  }
}

async function init() {
  await refreshItems();
  renderItems();
  updateSellerUi();

  sellerUnlockForm.addEventListener("submit", unlockSeller);
  sellerLockBtn.addEventListener("click", lockSeller);
  itemForm.addEventListener("submit", handleItemSubmit);
  itemCancelEditBtn.addEventListener("click", cancelEdit);
  itemDetailCloseBtn.addEventListener("click", closeItemDetailModal);
  itemDetailModal.addEventListener("click", closeDetailOnBackdrop);
}

init().catch((error) => {
  console.error(error);
  setMessage(sellerUnlockMessage, "Failed to initialize seller page.", true);
});
