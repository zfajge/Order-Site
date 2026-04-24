const API_BASE = "/api";
const IMAGE_MAX_DIMENSION = 1400;
const IMAGE_JPEG_QUALITY = 0.82;
const NEW_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;

const state = {
  editingItemId: null,
  items: [],
  user: null,
  profile: null,
};

const sellerAccountMessage = document.getElementById("seller-account-message");
const sellerPanel = document.getElementById("seller-panel");
const signOutBtn = document.getElementById("sign-out-btn");

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
const itemDetailCloseBtn = document.getElementById("close-item-detail-btn");
const itemDetailTitle = document.getElementById("item-detail-title");
const itemDetailPrice = document.getElementById("item-detail-price");
const itemDetailDescription = document.getElementById("item-detail-description");
const itemDetailOwner = document.getElementById("item-detail-owner");
const itemDetailMainImage = document.getElementById("item-detail-main-image");
const itemDetailGallery = document.getElementById("item-detail-gallery");

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

function canManageAllListings() {
  return state.profile?.canManageAllListings === true;
}

function canEditItem(item) {
  if (!state.user || state.user.role !== "seller") {
    return false;
  }
  if (canManageAllListings()) {
    return true;
  }
  return normalizeText(item?.creatorId) === normalizeText(state.user.id);
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
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

async function refreshItems() {
  const payload = await apiRequest("/items");
  state.items = Array.isArray(payload?.items) ? payload.items : [];
}

function updateSellerUi() {
  const unlocked = Boolean(state.user && state.user.role === "seller");
  sellerPanel.classList.toggle("hidden", !unlocked);
  if (!unlocked) {
    setMessage(
      sellerAccountMessage,
      "Seller access required. Please sign in with a seller account.",
      true
    );
    return;
  }
  setMessage(
    sellerAccountMessage,
    canManageAllListings()
      ? "You can create, edit, and delete all listings."
      : "You can create listings and manage listings created by your account."
  );
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
        resolve(originalDataUrl);
        return;
      }
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      const compressed = canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
      resolve(compressed || originalDataUrl);
    };
    image.onerror = () => resolve(originalDataUrl);
    image.src = originalDataUrl;
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
    return aUnavailable - bUnavailable;
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

    const canEdit = canEditItem(item);
    editBtn.disabled = !canEdit;
    deleteBtn.disabled = !canEdit;
    markAvailableBtn.disabled = !canEdit;
    markSoldBtn.disabled = !canEdit;
    markAvailableBtn.classList.toggle("hidden", item.status === "available");
    markSoldBtn.classList.toggle("hidden", item.status !== "hold");
    markAvailableBtn.textContent =
      item.status === "hold"
        ? "Remove Hold (Mark Available)"
        : "Remove Bought (Mark Available)";

    const openDetail = () => showItemDetail(item);
    image.style.cursor = "pointer";
    image.addEventListener("click", openDetail);
    title.style.cursor = "pointer";
    title.addEventListener("click", openDetail);

    editBtn.addEventListener("click", () => {
      if (!canEditItem(item)) {
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
      if (!canEditItem(item)) {
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
      if (!canEditItem(item)) {
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
      if (!canEditItem(item) || item.status !== "hold") {
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
      : `${getStatusLabel(item.status)}${item.ownerName ? ` by ${item.ownerName}` : ""}`;

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

async function loadAuthContext() {
  const mePayload = await apiRequest("/me");
  if (!mePayload?.authenticated || !mePayload.user) {
    window.location.href = "/signin?next=/seller";
    return false;
  }
  if (mePayload.user.role !== "seller") {
    window.location.href = "/";
    return false;
  }
  state.user = mePayload.user;
  const profilePayload = await apiRequest("/profile");
  state.profile = profilePayload?.profile || null;
  return true;
}

async function handleSignOut() {
  try {
    await apiRequest("/auth/signout", { method: "POST" });
  } catch (error) {
    window.alert(error.message);
    return;
  }
  window.location.href = "/signin";
}

async function handleItemSubmit(event) {
  event.preventDefault();
  setMessage(itemFormMessage, "");

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
      if (!canEditItem(current)) {
        throw new Error("You can only edit listings you created.");
      }
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
  const authOk = await loadAuthContext();
  if (!authOk) {
    return;
  }
  updateSellerUi();
  await refreshItems();
  renderItems();

  signOutBtn.addEventListener("click", handleSignOut);
  itemForm.addEventListener("submit", handleItemSubmit);
  itemCancelEditBtn.addEventListener("click", cancelEdit);
  itemDetailCloseBtn.addEventListener("click", closeItemDetailModal);
  itemDetailModal.addEventListener("click", closeDetailOnBackdrop);
}

init().catch((error) => {
  console.error(error);
  setMessage(sellerAccountMessage, "Failed to initialize seller page.", true);
});
