const EMAIL_RECIPIENT = "fajgezach@gmail.com";
const API_BASE = "/api";

const state = {
  items: [],
  cart: [],
};

const itemsGrid = document.getElementById("items-grid");
const cartCount = document.getElementById("cart-count");
const cartModal = document.getElementById("cart-modal");
const cartItemsContainer = document.getElementById("cart-items-container");
const checkoutForm = document.getElementById("checkout-form");
const checkoutMessage = document.getElementById("checkout-message");
const openCartBtn = document.getElementById("open-cart-btn");
const closeCartBtn = document.getElementById("close-cart-btn");
const itemCardTemplate = document.getElementById("item-card-template");
const itemDetailModal = document.getElementById("item-detail-modal");
const detailMainImage = document.getElementById("detail-main-image");
const detailItemTitle = document.getElementById("detail-item-title");
const detailItemPrice = document.getElementById("detail-item-price");
const detailItemStatus = document.getElementById("detail-item-status");
const detailItemDescription = document.getElementById("detail-item-description");
const detailExtraImages = document.getElementById("detail-extra-images");
const detailAddToCartBtn = document.getElementById("detail-add-to-cart-btn");
const closeItemDetailBtn = document.getElementById("close-item-detail-btn");
const checkoutWarning = document.getElementById("checkout-email-warning");

function formatPrice(price) {
  return `$${Number(price).toFixed(2)}`;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getItemById(id) {
  return state.items.find((item) => item.id === id);
}

function setCardDescription(element, text) {
  element.textContent = text;
  element.setAttribute("title", text);
}

function updateCartCount() {
  cartCount.textContent = String(state.cart.length);
}

function setCheckoutMessage(message, isError = false) {
  checkoutMessage.textContent = message;
  checkoutMessage.classList.toggle("error", isError);
}

function getCombinedImages(item) {
  const images = [];
  if (item.mainImage) {
    images.push(item.mainImage);
  }
  if (Array.isArray(item.extraImages) && item.extraImages.length) {
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

function showItemDetail(item) {
  const images = getCombinedImages(item);
  detailItemTitle.textContent = item.name;
  detailItemPrice.textContent = formatPrice(item.price);
  detailItemDescription.textContent = item.description;
  detailMainImage.src = images[0];
  detailMainImage.alt = item.name;
  detailExtraImages.innerHTML = "";
  const statusText =
    item.status === "available"
      ? "Available now"
      : `${item.status === "bought" ? "Bought" : "On Hold"}${
          item.ownerName ? ` by ${item.ownerName}` : ""
        }`;
  detailItemStatus.textContent = statusText;

  const canAddToCart = item.status === "available" && !state.cart.includes(item.id);
  detailAddToCartBtn.disabled = !canAddToCart;
  detailAddToCartBtn.textContent = canAddToCart ? "Add to cart" : "Unavailable";
  detailAddToCartBtn.onclick = () => {
    if (!state.cart.includes(item.id) && item.status === "available") {
      state.cart.push(item.id);
      updateCartCount();
      renderItems();
      hideItemDetail();
    }
  };

  images.forEach((url, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "detail-gallery-btn";
    if (index === 0) {
      button.classList.add("active");
    }

    const thumb = document.createElement("img");
    thumb.src = url;
    thumb.alt = `${item.name} photo ${index + 1}`;
    thumb.className = "detail-gallery-thumb";
    button.appendChild(thumb);

    button.addEventListener("click", () => {
      detailMainImage.src = url;
      detailMainImage.alt = `${item.name} photo ${index + 1}`;
      detailExtraImages
        .querySelectorAll(".detail-gallery-btn")
        .forEach((entry) => entry.classList.remove("active"));
      button.classList.add("active");
    });

    detailExtraImages.appendChild(button);
  });

  itemDetailModal.classList.remove("hidden");
}

function hideItemDetail() {
  itemDetailModal.classList.add("hidden");
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
    const errorMessage =
      payload && payload.error ? payload.error : `Request failed (${response.status})`;
    throw new Error(errorMessage);
  }
  return payload;
}

async function refreshItems() {
  const payload = await apiRequest("/items");
  const incomingItems = Array.isArray(payload.items) ? payload.items : [];
  const availableFirst = incomingItems
    .filter((item) => item.status === "available")
    .concat(incomingItems.filter((item) => item.status !== "available"));
  state.items = availableFirst;
  const validIds = new Set(state.items.map((item) => item.id));
  state.cart = state.cart.filter((id) => validIds.has(id));
  updateCartCount();
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
    const fragment = itemCardTemplate.content.cloneNode(true);
    const image = fragment.querySelector(".item-image");
    const title = fragment.querySelector(".item-title");
    const price = fragment.querySelector(".item-price");
    const description = fragment.querySelector(".item-description");
    const ownerNote = fragment.querySelector(".item-owner-note");
    const overlay = fragment.querySelector(".item-overlay");
    const overlayStatus = fragment.querySelector(".overlay-status");
    const overlayOwner = fragment.querySelector(".overlay-owner");
    const card = fragment.querySelector(".item-card");
    const addToCartBtn = fragment.querySelector(".add-to-cart-btn");
    const galleryWrap = fragment.querySelector(".gallery-thumbs");

    image.src =
      item.mainImage || "https://via.placeholder.com/1200x800?text=Item+Photo+Not+Available";
    image.alt = item.name;
    title.textContent = item.name;
    price.textContent = formatPrice(item.price);
    setCardDescription(description, item.description);

    const openDetail = () => showItemDetail(item);
    card.addEventListener("click", openDetail);
    image.style.cursor = "pointer";
    title.style.cursor = "pointer";

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
      ownerNote.textContent = "Available now";
      const inCart = state.cart.includes(item.id);
      addToCartBtn.disabled = inCart;
      addToCartBtn.textContent = inCart ? "In cart" : "Add to cart";
      addToCartBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!state.cart.includes(item.id)) {
          state.cart.push(item.id);
          updateCartCount();
          renderItems();
        }
      });
    }

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
    details.className = "cart-line-details";
    const title = document.createElement("p");
    title.className = "cart-line-title";
    title.textContent = item.name;
    const price = document.createElement("p");
    price.className = "muted";
    price.textContent = `Original price: ${formatPrice(item.price)} (negotiable)`;
    details.append(title, price);

    const controls = document.createElement("div");
    controls.className = "cart-line-controls";

    const actionLabel = document.createElement("label");
    actionLabel.textContent = "Action";
    const actionSelect = document.createElement("select");
    actionSelect.dataset.actionItemId = item.id;
    actionSelect.innerHTML = `
      <option value="buy">Buy</option>
      <option value="hold">Put on hold</option>
    `;
    actionLabel.appendChild(actionSelect);

    const offerLabel = document.createElement("label");
    offerLabel.textContent = "Your offer (optional)";
    const offerInput = document.createElement("input");
    offerInput.type = "number";
    offerInput.step = "0.01";
    offerInput.min = "0";
    offerInput.placeholder = "Example: 80";
    offerInput.dataset.offerItemId = item.id;
    offerLabel.appendChild(offerInput);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-ghost";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeFromCart(item.id));

    controls.append(actionLabel, offerLabel, removeBtn);
    line.append(details, controls);
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
    "Payment is handled personally (cash, Venmo, Zelle, PayPal, etc.)."
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
    return;
  }
  if (event.target === itemDetailModal) {
    hideItemDetail();
  }
}

function sortItemsForBuyer(items) {
  return [...items].sort((a, b) => {
    const aUnavailable = a.status !== "available";
    const bUnavailable = b.status !== "available";
    if (aUnavailable === bUnavailable) {
      return 0;
    }
    return aUnavailable ? 1 : -1;
  });
}

async function submitCheckout(event) {
  event.preventDefault();
  setCheckoutMessage("");

  if (!state.cart.length) {
    setCheckoutMessage("Your cart is empty.", true);
    return;
  }

  const buyerName = normalizeText(document.getElementById("buyer-name").value);
  const buyerPhone = normalizeText(document.getElementById("buyer-phone").value);
  if (!buyerName || !buyerPhone) {
    setCheckoutMessage("Please enter both your name and phone number.", true);
    return;
  }

  const selections = [];
  state.cart.forEach((itemId) => {
    const item = getItemById(itemId);
    if (!item || item.status !== "available") {
      return;
    }
    const actionElement = cartItemsContainer.querySelector(`[data-action-item-id="${item.id}"]`);
    const offerElement = cartItemsContainer.querySelector(`[data-offer-item-id="${item.id}"]`);
    selections.push({
      itemId: item.id,
      action: actionElement ? actionElement.value : "buy",
      offer: parseOfferValue(offerElement ? offerElement.value : ""),
    });
  });

  if (!selections.length) {
    setCheckoutMessage("No available items left in your cart.", true);
    return;
  }

  try {
    const payload = await apiRequest("/checkout", {
      method: "POST",
      body: JSON.stringify({ buyerName, buyerPhone, selections }),
    });
    state.items = Array.isArray(payload.items) ? payload.items : state.items;
    const processedIds = new Set((payload.processed || []).map((entry) => entry.itemId));
    state.cart = state.cart.filter((id) => !processedIds.has(id));
    updateCartCount();
    renderItems();
    renderCart();

    if (Array.isArray(payload.processed) && payload.processed.length > 0) {
      setCheckoutMessage("Success! Checkout submitted.");
      checkoutForm.reset();
      closeCart();
      window.alert(
        "Success! You will now be redirected to your email app to send Zach a confirmation email."
      );
      window.location.href = buildMailtoLink({
        buyerName: payload.buyerName || buyerName,
        buyerPhone: payload.buyerPhone || buyerPhone,
        processed: payload.processed,
      });
    } else {
      setCheckoutMessage("No items were processed.", true);
      return;
    }
  } catch (error) {
    setCheckoutMessage(error.message, true);
  }
}

async function init() {
  await refreshItems();
  renderItems();
  updateCartCount();

  openCartBtn.addEventListener("click", openCart);
  closeCartBtn.addEventListener("click", closeCart);
  closeItemDetailBtn.addEventListener("click", hideItemDetail);
  cartModal.addEventListener("click", closeOnBackdropClick);
  itemDetailModal.addEventListener("click", closeOnBackdropClick);
  checkoutForm.addEventListener("submit", submitCheckout);
}

init().catch((error) => {
  console.error(error);
  setCheckoutMessage("Could not load items right now.", true);
});
