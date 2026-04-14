/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutine = document.getElementById("generateRoutine");
const clearAll = document.getElementById("clearAll");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const rtlToggle = document.getElementById("rtlToggle");
const showMoreBtn = document.getElementById("showMoreBtn");
const showMoreContainer = document.getElementById("showMoreContainer");
const WORKER_ENDPOINT = "https://hidden-base-9b88.superctecreal.workers.dev/";

let allProducts = [];
let selectedProducts = [];
let chatHistory = [];
let showAllProducts = false;
const initialLimit = 6;

/* Load selected products from localStorage */
function loadSelectedProducts() {
  const stored = localStorage.getItem("selectedProducts");
  if (stored) {
    selectedProducts = JSON.parse(stored);
  }
}

/* Save selected products to localStorage */
function saveSelectedProducts() {
  localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));
}

/* Load chat history from localStorage */
function loadChatHistory() {
  const stored = localStorage.getItem("chatHistory");
  if (stored) {
    chatHistory = JSON.parse(stored);
    displayChatHistory();
  }
}

/* Save chat history to localStorage */
function saveChatHistory() {
  localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
}

function getContentFromOutput(output) {
  if (!output) return null;
  return output
    .map((item) => {
      if (typeof item === "string") return item;
      if (item?.text) return item.text;
      if (item?.type === "output_text" && item?.text) return item.text;
      if (Array.isArray(item?.content)) {
        return item.content
          .map((c) => c?.text || "")
          .filter(Boolean)
          .join(" ");
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function extractAssistantText(data) {
  if (!data) return null;
  if (data.error) {
    throw new Error(
      data.error.message || data.error || "Worker returned an error payload.",
    );
  }

  const possible = [
    data?.content,
    data?.output_text,
    data?.response?.output_text,
    data?.choices?.[0]?.message?.content,
    data?.choices?.[0]?.text,
    data?.choices?.[0]?.delta?.content,
    getContentFromOutput(data?.output),
    getContentFromOutput(data?.response?.output),
    getContentFromOutput(data?.response?.output?.[0]?.content),
    getContentFromOutput(data?.output?.[0]?.content),
  ];

  const text = possible.find(
    (item) => typeof item === "string" && item.trim().length > 0,
  );
  if (!text) {
    console.warn(
      "Unexpected worker response format, no assistant text found:",
      data,
    );
  }
  return text || null;
}

async function fetchWorker(body) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(WORKER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const text = await response.text();
    let data = JSON.parse(text);

    if (!response.ok) {
      const errorDetails = data?.error || data?.message || "Unknown error";
      throw new Error(`Worker ${response.status}: ${errorDetails}`);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timeout (30s)");
    }
    throw error;
  }
}

/* Display chat history */
function linkifyURLs(text) {
  const urlRegex = /(https?:\/\/[^\s).,!?;:>\\]+)/g;
  return text.replace(
    urlRegex,
    '<a href="$1" target="_blank" rel="noopener" class="inline-link">$1</a>',
  );
}

function displayChatHistory() {
  const fragment = document.createDocumentFragment();

  chatHistory.forEach((msg) => {
    const emoji = msg.role === "user" ? "👤" : "💄";
    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${msg.role}`;

    const contentDiv = document.createElement("div");
    contentDiv.textContent = `${emoji} ${msg.content}`;
    messageDiv.appendChild(contentDiv);

    // Display sources if they exist
    if (msg.sources && msg.sources.length > 0) {
      const sourcesDiv = document.createElement("div");
      sourcesDiv.className = "sources";
      msg.sources.forEach((source) => {
        const url = source.url || source.link || source.source || "#";
        const title = source.title || source.name || "Source";
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        link.className = "source-link";
        link.textContent = `🔗 ${title}`;
        sourcesDiv.appendChild(link);
      });
      messageDiv.appendChild(sourcesDiv);
    }

    fragment.appendChild(messageDiv);
  });

  chatWindow.innerHTML = "";
  chatWindow.appendChild(fragment);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Load product data from JSON file */
async function loadProducts() {
  if (allProducts.length === 0) {
    const response = await fetch("products.json");
    const data = await response.json();
    allProducts = data.products;
  }
  return allProducts;
}

/* Create HTML for displaying product cards */
function displayProducts(products, limit = null) {
  let displayProducts = limit ? products.slice(0, limit) : products;
  productsContainer.innerHTML = displayProducts
    .map((product) => {
      const isSelected = selectedProducts.some((p) => p.id === product.id);
      return `
    <div class="product-card ${isSelected ? "selected" : ""}" data-id="${product.id}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <button class="description-toggle">Show Description</button>
        <div class="product-description" style="display: none;">${product.description}</div>
      </div>
    </div>
  `;
    })
    .join("");
}

/* Update selected products list */
function updateSelectedProductsList() {
  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) =>
        `<div class="selected-item" data-id="${product.id}">
      <span>${product.brand} - ${product.name}</span>
      <button class="remove-btn">×</button>
    </div>`,
    )
    .join("");
  saveSelectedProducts();
}

/* Filter and display products */
function filterAndDisplayProducts() {
  const products = allProducts;
  const selectedCategory = categoryFilter.value;
  const searchTerm = productSearch.value.toLowerCase();

  let filteredProducts = products;

  if (selectedCategory) {
    filteredProducts = filteredProducts.filter(
      (product) => product.category === selectedCategory,
    );
  }

  if (searchTerm) {
    filteredProducts = filteredProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.brand.toLowerCase().includes(searchTerm),
    );
  }

  if (filteredProducts.length === 0) {
    productsContainer.innerHTML =
      '<div class="placeholder-message">No products found matching your criteria.</div>';
    showMoreContainer.style.display = "none";
  } else {
    const shouldLimit = !selectedCategory && !searchTerm && !showAllProducts;
    const limit = shouldLimit ? initialLimit : null;
    displayProducts(filteredProducts, limit);
    if (shouldLimit && filteredProducts.length > initialLimit) {
      showMoreContainer.style.display = "block";
    } else {
      showMoreContainer.style.display = "none";
    }
  }
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", () => {
  showAllProducts = false;
  filterAndDisplayProducts();
});

/* Filter when search changes */
productSearch.addEventListener("input", () => {
  showAllProducts = false;
  filterAndDisplayProducts();
});

/* Product card click handler */
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return;

  const productId = parseInt(card.dataset.id);
  const product = allProducts.find((p) => p.id === productId);

  if (e.target.classList.contains("description-toggle")) {
    const desc = card.querySelector(".product-description");
    const toggle = e.target;
    if (desc.style.display === "none") {
      desc.style.display = "block";
      toggle.textContent = "Hide Description";
    } else {
      desc.style.display = "none";
      toggle.textContent = "Show Description";
    }
    return;
  }

  // Toggle selection
  const index = selectedProducts.findIndex((p) => p.id === productId);
  if (index > -1) {
    selectedProducts.splice(index, 1);
    card.classList.remove("selected");
  } else {
    selectedProducts.push(product);
    card.classList.add("selected");
  }
  updateSelectedProductsList();
});

/* Remove from selected list */
selectedProductsList.addEventListener("click", (e) => {
  if (e.target.classList.contains("remove-btn")) {
    const item = e.target.closest(".selected-item");
    const productId = parseInt(item.dataset.id);
    selectedProducts = selectedProducts.filter((p) => p.id !== productId);
    updateSelectedProductsList();
    // Update visual on grid if visible
    const card = productsContainer.querySelector(
      `.product-card[data-id="${productId}"]`,
    );
    if (card) card.classList.remove("selected");
  }
});

/* Generate routine */
generateRoutine.addEventListener("click", async () => {
  if (selectedProducts.length === 0) {
    alert("Please select some products first.");
    return;
  }

  const prompt = `Create a personalized skincare/haircare/makeup routine using these selected products: ${selectedProducts.map((p) => `${p.brand} ${p.name} (${p.category}): ${p.description}`).join(", ")}. Provide step-by-step instructions for daily use.`;

  chatHistory.push({
    role: "user",
    content: `Generate routine with: ${selectedProducts.map((p) => p.name).join(", ")}`,
  });
  saveChatHistory();
  displayChatHistory();

  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a skincare expert. Create personalized routines based on selected products. For any current information or trends, search the web and include links or citations.",
      },
      { role: "user", content: prompt },
    ];
    const data = await fetchWorker({ messages });
    const routine = extractAssistantText(data) || "No response generated.";
    const assistantMsg = { role: "assistant", content: routine };
    if (data.sources && data.sources.length > 0) {
      assistantMsg.sources = data.sources;
    }
    chatHistory.push(assistantMsg);
    saveChatHistory();
    displayChatHistory();
  } catch (error) {
    console.error("Error generating routine:", error);
    chatHistory.push({
      role: "assistant",
      content: `Sorry, there was an error generating your routine. ${error.message}`,
    });
    saveChatHistory();
    displayChatHistory();
  }
});

/* Chat form submission handler */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message) return;

  chatHistory.push({ role: "user", content: message });
  saveChatHistory();
  displayChatHistory();
  userInput.value = "";

  try {
    const messages = chatHistory.map((h) => {
      const msg = { role: h.role, content: h.content };
      return msg;
    });
    // Add instruction for web search if needed
    messages.unshift({
      role: "system",
      content:
        "You are a skincare expert. For questions about current products, trends, or information, search the web for real-time data and include links or citations in your responses.",
    });
    const data = await fetchWorker({ messages });
    const reply = extractAssistantText(data) || "No response generated.";
    const assistantMsg = { role: "assistant", content: reply };
    if (data.sources && data.sources.length > 0) {
      assistantMsg.sources = data.sources;
    }
    chatHistory.push(assistantMsg);
    saveChatHistory();
    displayChatHistory();
  } catch (error) {
    console.error("Error sending message:", error);
    chatHistory.push({
      role: "assistant",
      content: `Sorry, there was an error processing your message. ${error.message}`,
    });
    saveChatHistory();
    displayChatHistory();
  }
});

/* Clear all selected products */
clearAll.addEventListener("click", () => {
  selectedProducts = [];
  updateSelectedProductsList();
  // Update visual on grid
  document
    .querySelectorAll(".product-card.selected")
    .forEach((card) => card.classList.remove("selected"));
});

/* RTL toggle */
rtlToggle.addEventListener("click", () => {
  document.body.classList.toggle("rtl");
  rtlToggle.textContent = document.body.classList.contains("rtl")
    ? "LTR"
    : "RTL";
});

/* Show more products */
showMoreBtn.addEventListener("click", () => {
  showAllProducts = true;
  filterAndDisplayProducts();
});

/* Initialize */
async function init() {
  await loadProducts();
  loadSelectedProducts();
  loadChatHistory();
  updateSelectedProductsList();
  filterAndDisplayProducts();
}

init();
