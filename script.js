const STORAGE_KEY = "moveOutSaleItems";
const EMAIL_RECIPIENT = "fajgezach@gmail.com";

const defaultItems = [
  {
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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

const state = {
  items: [],
  cart: [],
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

const itemForm = document.getElementById("item-form");
const itemNameInput = document.getElementById("item-name");
const itemPriceInput = document.getElementById("item-price");
const itemDescriptionInput = document.getElementById("item-description");
const itemMainImageUrlInput = document.getElementById("item-main-image-url");
const itemMainImageFileInput = document.getElementById("item-main-image-file");
const itemExtraImagesUrlsInput = document.getElementById("item-extra-images-urls");
const itemExtraImagesFilesInput = document.getElementById("item-extra-images-files");

function loadItems() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    state.items = defaultItems;
    persistItems();
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid item structure");
    }
    state.items = parsed;
  } catch (error) {
    console.error("Failed to parse items from storage:", error);
    state.items = defaultItems;
    persistItems();
  }
}

function persistItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function formatPrice(price) {
  return `$${Number(price).toFixed(2)}`;
}

function getItemById(id) {
  return state.items.find((item) => item.id === id);
}

function updateCartCount() {
  cartCount.textContent = String(state.cart.length);
}

function updateCheckoutMessage(message, isError = false) {
  checkoutMessage.textContent = message;
  checkoutMessage.style.color = isError ? "#b31c1c" : "#1e7a4b";
}

function renderItems() {
  itemsGrid.innerHTML = "";

  if (!state.items.length) {
    const empty = document.createElement("p");
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
    const overlay = fragment.querySelector(".item-overlay");
    const overlayStatus = fragment.querySelector(".overlay-status");
    const overlayOwner = fragment.querySelector(".overlay-owner");
    const ownerNote = fragment.querySelector(".item-owner-note");
    const addToCartButton = fragment.querySelector(".add-to-cart-btn");

    image.src =
      item.mainImage ||
      "https://via.placeholder.com/900x600?text=Item+Photo+Not+Available";
    image.alt = item.name;
    title.textContent = item.name;
    price.textContent = formatPrice(item.price);
    description.textContent = item.description;

    const isUnavailable = item.status !== "available";
    if (isUnavailable) {
      overlay.classList.remove("hidden");
      overlayStatus.textContent = item.status === "bought" ? "Bought" : "On Hold";
      overlayOwner.textContent = item.ownerName ? `By: ${item.ownerName}` : "";
      ownerNote.textContent = item.ownerName
        ? `${overlayStatus.textContent} by ${item.ownerName}`
        : overlayStatus.textContent;
      addToCartButton.disabled = true;
      addToCartButton.textContent = overlayStatus.textContent;
    } else {
      overlay.classList.add("hidden");
      ownerNote.textContent = "Available";
      addToCartButton.disabled = state.cart.includes(item.id);
      addToCartButton.textContent = state.cart.includes(item.id)
        ? "In Cart"
        : "Add to cart";
    }

    addToCartButton.addEventListener("click", () => addToCart(item.id));
    card.dataset.itemId = item.id;
    itemsGrid.appendChild(fragment);
  });
}

function addToCart(itemId) {
  const item = getItemById(itemId);
  if (!item || item.status !== "available") {
    return;
  }
  if (!state.cart.includes(itemId)) {
    state.cart.push(itemId);
  }
  updateCartCount();
  renderItems();
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
    offerLabel.className = "offer-input-wrap";
    offerLabel.textContent = "Your offer (optional)";

    const offerInput = document.createElement("input");
    offerInput.type = "number";
    offerInput.step = "0.01";
    offerInput.min = "0";
    offerInput.placeholder = "Leave blank if paying asking price";
    offerInput.dataset.offerItemId = item.id;

    offerLabel.appendChild(offerInput);

    details.append(title, price, offerLabel);

    const actionWrap = document.createElement("div");
    actionWrap.className = "cart-line-actions";

    const statusSelect = document.createElement("select");
    statusSelect.name = `action-${item.id}`;
    statusSelect.dataset.actionItemId = item.id;
    statusSelect.innerHTML = `
      <option value="bought">Buy</option>
      <option value="hold">Put on Hold</option>
    `;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeFromCart(item.id));

    actionWrap.append(statusSelect, removeBtn);
    line.append(details, actionWrap);
    cartItemsContainer.appendChild(line);
  });
}

function openCart() {
  renderCart();
  cartModal.classList.remove("hidden");
}

function closeCart() {
  cartModal.classList.add("hidden");
}

function parseOfferValue(value) {
  if (!value || value.trim() === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
}

function buildMailtoLink({ buyerName, buyerPhone, selectedItems }) {
  const subject = encodeURIComponent(`Move-Out Sale Checkout: ${buyerName}`);

  const lines = [
    "New checkout submission:",
    "",
    `Name: ${buyerName}`,
    `Phone: ${buyerPhone}`,
    "",
    "Items:",
  ];

  selectedItems.forEach((entry, index) => {
    const offerText =
      entry.offer == null
        ? "No offer submitted"
        : `Offer submitted: ${formatPrice(entry.offer)}`;
    const statusText = entry.action === "bought" ? "Bought" : "On Hold";
    lines.push(
      `${index + 1}. ${entry.item.name}`,
      `   Status: ${statusText}`,
      `   Original price: ${formatPrice(entry.item.price)}`,
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

function submitCheckout(event) {
  event.preventDefault();
  updateCheckoutMessage("");

  if (!state.cart.length) {
    updateCheckoutMessage("Your cart is empty.", true);
    return;
  }

  const buyerName = document.getElementById("buyer-name").value.trim();
  const buyerPhone = document.getElementById("buyer-phone").value.trim();

  if (!buyerName || !buyerPhone) {
    updateCheckoutMessage("Please enter both your name and phone number.", true);
    return;
  }

  const selectedItems = [];
  const unavailableNames = [];

  state.cart.forEach((itemId) => {
    const item = getItemById(itemId);
    if (!item || item.status !== "available") {
      if (item) {
        unavailableNames.push(item.name);
      }
      return;
    }

    const actionElement = cartItemsContainer.querySelector(
      `[data-action-item-id="${item.id}"]`
    );
    const offerElement = cartItemsContainer.querySelector(
      `[data-offer-item-id="${item.id}"]`
    );
    const action = actionElement ? actionElement.value : "bought";
    const offer = parseOfferValue(offerElement ? offerElement.value : "");

    selectedItems.push({ item, action, offer });
  });

  if (!selectedItems.length) {
    updateCheckoutMessage(
      "No available items left in cart. Please refresh your selections.",
      true
    );
    return;
  }

  selectedItems.forEach(({ item, action }) => {
    item.status = action === "bought" ? "bought" : "hold";
    item.ownerName = buyerName;
  });

  persistItems();
  const selectedIds = selectedItems.map((entry) => entry.item.id);
  state.cart = state.cart.filter((id) => !selectedIds.includes(id));
  updateCartCount();
  renderItems();
  renderCart();

  const mailtoLink = buildMailtoLink({ buyerName, buyerPhone, selectedItems });
  window.location.href = mailtoLink;

  if (unavailableNames.length) {
    updateCheckoutMessage(
      `Checkout submitted for available items. Unavailable items skipped: ${unavailableNames.join(
        ", "
      )}.`
    );
  } else {
    updateCheckoutMessage(
      "Checkout submitted. Your email app should open so the seller can get your details."
    );
  }

  checkoutForm.reset();
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
  const mainImageUrl = itemMainImageUrlInput.value.trim();
  let mainImage = mainImageUrl;
  if (mainImageFile) {
    mainImage = await readImageFileAsDataURL(mainImageFile);
  }

  const extraImages = itemExtraImagesUrlsInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const extraFiles = Array.from(itemExtraImagesFilesInput.files);
  for (const file of extraFiles) {
    const dataUrl = await readImageFileAsDataURL(file);
    extraImages.push(dataUrl);
  }

  return { mainImage, extraImages };
}

async function handleAddItem(event) {
  event.preventDefault();

  const name = itemNameInput.value.trim();
  const description = itemDescriptionInput.value.trim();
  const price = Number(itemPriceInput.value);

  if (!name || !description || !Number.isFinite(price) || price < 0) {
    alert("Please enter a valid item name, description, and price.");
    return;
  }

  try {
    const { mainImage, extraImages } = await collectImages();

    state.items.unshift({
      id: crypto.randomUUID(),
      name,
      price,
      description,
      mainImage,
      extraImages,
      status: "available",
      ownerName: "",
    });

    persistItems();
    renderItems();
    itemForm.reset();
  } catch (error) {
    console.error(error);
    alert("Could not read image files. Please try again.");
  }
}

function closeOnBackdropClick(event) {
  if (event.target === cartModal) {
    closeCart();
  }
}

function init() {
  loadItems();
  renderItems();
  updateCartCount();

  openCartBtn.addEventListener("click", openCart);
  closeCartBtn.addEventListener("click", closeCart);
  cartModal.addEventListener("click", closeOnBackdropClick);
  checkoutForm.addEventListener("submit", submitCheckout);
  itemForm.addEventListener("submit", handleAddItem);
}

init();
