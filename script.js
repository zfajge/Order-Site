const EMAIL_RECIPIENT = "fajgezach@gmail.com";
const API_BASE = "/api";

const state = {
  items: [],
  cart: [],
  sellerToken: "",
  editingItemId: null,
};

const itemsGrid = document.getElementById("items-grid");
const cartCount = document.getElementById("cart-count");
const itemTemplate = document.getElementById("item-card-template");
const cartModal = document.getElementById("cart-modal");
const cartItemsContainer = document.getElementById("cart-items-container");
const checkoutForm = document.getElementById("checkout-form");
const checkoutMessage = document.getElementById("checkout-message");

const openCartBtn = document.getElementById("open-cart-btn");
const closeCartBtn = document.getElementById("close-cart-btn");

const sellerPasswordInput = document.getElementById("seller-password");
const sellerUnlockMessage = document.getElementById("seller-unlock-message");
const unlockSellerBtn = document.getElementById("unlock-seller-btn");
const sellerLockBtn = document.getElementById("seller-lock-btn");
const sellerConfigHint = document.getElementById("seller-config-hint");

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

function formatPrice(price) {
  return `$${Number(price).toFixed(2)}`;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getItemById(id) {
  return state.items.find((item) => item.id === id);
}

function updateCartCount() {
  cartCount.textContent = String(state.cart.length);
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function updateCheckoutMessage(message, isError = false) {
  checkoutMessage.textContent = message;
  checkoutMessage.style.color = isError ? "#b31c1c" : "#1e7a4b";
}

function parseOfferValue(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (state.sellerToken) {
    headers["x-seller-token"] = state.sellerToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  }

  if (!response.ok) {
    const message =
      payload && payload.error ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

async function refreshItems() {
  const payload = await apiRequest("/items");
  state.items = Array.isArray(payload.items) ? payload.items : [];

  const validIds = new Set(state.items.map((item) => item.id));
  state.cart = state.cart.filter((id) => validIds.has(id));
  updateCartCount();
}

async function loadSellerConfigHint() {
  try {
    const config = await apiRequest("/seller-config");
    setMessage(sellerConfigHint, config.hint || "");
  } catch {
    setMessage(sellerConfigHint, "");
  }
}

function updateSellerUi() {
  const unlocked = Boolean(state.sellerToken);
  unlockSellerBtn.classList.toggle("hidden", unlocked);
  sellerLockBtn.classList.toggle("hidden", !unlocked);
  itemSubmitBtn.disabled = !unlocked;
  if (!unlocked) {
    state.editingItemId = null;
    itemFormTitle.textContent = "Add Item";
    itemSubmitBtn.textContent = "Add Item";
    itemCancelEditBtn.classList.add("hidden");
  }
}

function resetItemForm() {
  itemForm.reset();
  state.editingItemId = null;
  itemFormTitle.textContent = "Add Item";
  itemSubmitBtn.textContent = "Add Item";
  itemCancelEditBtn.classList.add("hidden");
  setMessage(itemFormMessage, "");
}

function fillItemFormForEdit(item) {
  itemNameInput.value = item.name;
  itemPriceInput.value = item.price;
  itemDescriptionInput.value = item.description;
  itemMainImageUrlInput.value = item.mainImage || "";
  itemExtraImagesUrlsInput.value = (item.extraImages || []).join("\n");
}

async function readImageFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
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
    empty.textContent = "No items listed yet.";
    itemsGrid.appendChild(empty);
    return;
  }

  state.items.forEach((item) => {
    const fragment = itemTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".item-card");
    const image = fragment.querySelector(".item-image");
    const title = fragment.querySelector(".item-title");
    const price = fragment.querySelector(".item-price");
    const description = fragment.querySelector(".item-description");
    const ownerNote = fragment.querySelector(".item-owner-note");
    const overlay = fragment.querySelector(".item-overlay");
    const overlayStatus = fragment.querySelector(".overlay-status");
    const overlayOwner = fragment.querySelector(".overlay-owner");
    const addToCartBtn = fragment.querySelector(".add-to-cart-btn");
    const sellerControls = fragment.querySelector(".seller-item-controls");
    const editBtn = fragment.querySelector(".edit-item-btn");
    const deleteBtn = fragment.querySelector(".delete-item-btn");
    const galleryWrap = fragment.querySelector(".gallery-thumbs");

    image.src =
      item.mainImage || "https://via.placeholder.com/900x600?text=Item+Photo+Not+Available";
    image.alt = item.name;
    title.textContent = item.name;
    price.textContent = formatPrice(item.price);
    description.textContent = item.description;

    const unavailable = item.status !== "available";
    if (unavailable) {
      const statusText = item.status === "bought" ? "Bought" : "On Hold";
      overlay.classList.remove("hidden");
      overlayStatus.textContent = statusText;
      overlayOwner.textContent = item.ownerName ? `By: ${item.ownerName}` : "";
      ownerNote.textContent = item.ownerName ? `${statusText} by ${item.ownerName}` : statusText;
      addToCartBtn.disabled = true;
      addToCartBtn.textContent = statusText;
    } else {
      overlay.classList.add("hidden");
      ownerNote.textContent = "Available";
      const inCart = state.cart.includes(item.id);
      addToCartBtn.disabled = inCart;
      addToCartBtn.textContent = inCart ? "In Cart" : "Add to cart";
    }

    if (Array.isArray(item.extraImages) && item.extraImages.length) {
      galleryWrap.classList.remove("hidden");
      item.extraImages.slice(0, 4).forEach((url, index) => {
        const thumb = document.createElement("img");
        thumb.className = "gallery-thumb";
        thumb.src = url;
        thumb.alt = `${item.name} extra image ${index + 1}`;
        galleryWrap.appendChild(thumb);
      });
    } else {
      galleryWrap.classList.add("hidden");
    }

    addToCartBtn.addEventListener("click", () => {
      if (!state.cart.includes(item.id) && item.status === "available") {
        state.cart.push(item.id);
        updateCartCount();
        renderItems();
      }
    });

  if (state.sellerToken) {
      sellerControls.classList.remove("hidden");
      editBtn.addEventListener("click", () => {
        state.editingItemId = item.id;
        fillItemFormForEdit(item);
        itemFormTitle.textContent = "Edit Item";
        itemSubmitBtn.textContent = "Save Changes";
        itemCancelEditBtn.classList.remove("hidden");
        setMessage(itemFormMessage, "");
      });
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm(`Delete "${item.name}"?`)) {
          return;
        }
        try {
          await apiRequest(`/items/${item.id}`, { method: "DELETE" });
          await refreshItems();
          renderItems();
          renderCart();
        } catch (error) {
          alert(`Could not delete item: ${error.message}`);
        }
      });
    } else {
      sellerControls.classList.add("hidden");
    }

    card.dataset.itemId = item.id;
    itemsGrid.appendChild(fragment);
  });
}

function removeFromCart(itemId) {
  state.cart = state.cart.filter((id) => id !== itemId);
  updateCartCount();
  renderItems();
  renderCart();
}

function renderCart() {
  cartItemsContainer.innerHTML = "";
  if (!state.cart.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Your cart is empty.";
    cartItemsContainer.appendChild(empty);
    return;
  }

  state.cart.forEach((itemId) => {
    const item = getItemById(itemId);
    if (!item || item.status !== "available") {
      return;
    }

    const line = document.createElement("div");
    line.className = "cart-line";

    const details = document.createElement("div");
    const title = document.createElement("p");
    title.className = "cart-line-title";
    title.textContent = item.name;
    const price = document.createElement("p");
    price.className = "cart-line-price";
    price.textContent = `Price: ${formatPrice(item.price)} (negotiable)`;

    const offerLabel = document.createElement("label");
    offerLabel.textContent = "Your offer (optional)";
    const offerInput = document.createElement("input");
    offerInput.type = "number";
    offerInput.min = "0";
    offerInput.step = "0.01";
    offerInput.placeholder = "Leave blank if paying asking price";
    offerInput.dataset.offerItemId = item.id;
    offerLabel.appendChild(offerInput);

    details.append(title, price, offerLabel);

    const actions = document.createElement("div");
    actions.className = "cart-line-actions";
    const selectLabel = document.createElement("label");
    selectLabel.textContent = "Action";
    const select = document.createElement("select");
    select.dataset.actionItemId = item.id;
    select.innerHTML = `
      <option value="buy">Buy</option>
      <option value="hold">Put on Hold</option>
    `;
    selectLabel.appendChild(select);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeFromCart(item.id));

    actions.append(selectLabel, removeBtn);
    line.append(details, actions);
    cartItemsContainer.appendChild(line);
  });
}

function buildMailtoLink({ buyerName, buyerPhone, processed }) {
  const subject = encodeURIComponent(`Move-Out Sale Checkout: ${buyerName}`);
  const lines = [
    "New checkout submission:",
    "",
    `Name: ${buyerName}`,
    `Phone: ${buyerPhone}`,
    "",
    "Items:",
  ];

  processed.forEach((entry, index) => {
    const statusText = entry.action === "bought" ? "Bought" : "On Hold";
    const offerText =
      entry.offer == null ? "No offer submitted" : `Offer submitted: ${formatPrice(entry.offer)}`;
    lines.push(
      `${index + 1}. ${entry.itemName}`,
      `   Status: ${statusText}`,
      `   Original price: ${formatPrice(entry.originalPrice)}`,
      `   ${offerText}`
    );
  });

  lines.push(
    "",
    "Payment to be arranged personally (cash, Venmo, Zelle, PayPal, etc.)."
  );

  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${EMAIL_RECIPIENT}?subject=${subject}&body=${body}`;
}

function openCart() {
  renderCart();
  cartModal.classList.remove("hidden");
}

function closeCart() {
  cartModal.classList.add("hidden");
}

function closeOnBackdropClick(event) {
  if (event.target === cartModal) {
    closeCart();
  }
}

async function submitCheckout(event) {
  event.preventDefault();
  updateCheckoutMessage("");

  if (!state.cart.length) {
    updateCheckoutMessage("Your cart is empty.", true);
    return;
  }

  const buyerName = normalizeText(document.getElementById("buyer-name").value);
  const buyerPhone = normalizeText(document.getElementById("buyer-phone").value);
  if (!buyerName || !buyerPhone) {
    updateCheckoutMessage("Please enter both your name and phone number.", true);
    return;
  }

  const selections = [];
  for (const itemId of state.cart) {
    const item = getItemById(itemId);
    if (!item || item.status !== "available") {
      continue;
    }
    const actionElement = cartItemsContainer.querySelector(`[data-action-item-id="${item.id}"]`);
    const offerElement = cartItemsContainer.querySelector(`[data-offer-item-id="${item.id}"]`);
    selections.push({
      itemId: item.id,
      action: actionElement ? actionElement.value : "buy",
      offer: parseOfferValue(offerElement ? offerElement.value : ""),
    });
  }

  if (!selections.length) {
    updateCheckoutMessage("No available items left in cart.", true);
    return;
  }

  try {
    const payload = await apiRequest("/checkout", {
      method: "POST",
      body: JSON.stringify({ buyerName, buyerPhone, selections }),
    });

    await refreshItems();
    const purchasedIds = new Set((payload.processed || []).map((entry) => entry.itemId));
    state.cart = state.cart.filter((id) => !purchasedIds.has(id));
    updateCartCount();
    renderItems();
    renderCart();

    if (Array.isArray(payload.processed) && payload.processed.length) {
      window.location.href = buildMailtoLink({
        buyerName: payload.buyerName || buyerName,
        buyerPhone: payload.buyerPhone || buyerPhone,
        processed: payload.processed,
      });
      updateCheckoutMessage(
        "Checkout submitted. Your email app should open with details for the seller."
      );
    } else {
      updateCheckoutMessage("No items were processed.", true);
    }
    checkoutForm.reset();
  } catch (error) {
    updateCheckoutMessage(error.message, true);
  }
}

async function unlockSeller(event) {
  if (event) {
    event.preventDefault();
  }
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
    state.sellerToken = payload.token || "";
    if (!state.sellerToken) {
      throw new Error("Seller login failed.");
    }
    setMessage(sellerUnlockMessage, "");
    updateSellerUi();
    renderItems();
  } catch (error) {
    setMessage(sellerUnlockMessage, error.message, true);
  }
}

function lockSeller() {
  state.sellerToken = "";
  sellerPasswordInput.value = "";
  resetItemForm();
  updateSellerUi();
  renderItems();
}

async function handleItemSubmit(event) {
  event.preventDefault();
  setMessage(itemFormMessage, "");

  if (!state.sellerToken) {
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
    const payload = {
      name,
      price,
      description,
      mainImage,
      extraImages,
    };

    if (state.editingItemId) {
      await apiRequest(`/items/${state.editingItemId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setMessage(itemFormMessage, "Item updated.");
    } else {
      await apiRequest("/items", {
        method: "POST",
        body: JSON.stringify(payload),
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
}

async function init() {
  await Promise.all([refreshItems(), loadSellerConfigHint()]);
  renderItems();
  updateCartCount();
  updateSellerUi();

  openCartBtn.addEventListener("click", openCart);
  closeCartBtn.addEventListener("click", closeCart);
  cartModal.addEventListener("click", closeOnBackdropClick);
  checkoutForm.addEventListener("submit", submitCheckout);
  unlockSellerBtn.addEventListener("click", unlockSeller);
  sellerLockBtn.addEventListener("click", lockSeller);
  itemForm.addEventListener("submit", handleItemSubmit);
  itemCancelEditBtn.addEventListener("click", cancelEdit);
}

init().catch((error) => {
  console.error(error);
  updateCheckoutMessage("Failed to initialize app.", true);
});
