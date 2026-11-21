const DB_NAME = "elcica-pos-db";
const DB_VERSION = 1;

let db;
let products = [];
let cart = [];

const $ = (id) => document.getElementById(id);

const rupiah = (value) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(value);

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains("products")) {
                database.createObjectStore("products", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }

            if (!database.objectStoreNames.contains("transactions")) {
                const store = database.createObjectStore("transactions", {
                    keyPath: "id",
                    autoIncrement: true
                });

                store.createIndex("createdAt", "createdAt");
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transaction(storeName, mode, operation) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        let result;

        try {
            result = operation(store);
        } catch (error) {
            tx.abort();
            reject(error);
            return;
        }

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Transaksi database dibatalkan"));
    });
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function seedProducts() {
    const existing = await requestResult(
        db.transaction("products", "readonly")
            .objectStore("products")
            .count()
    );

    if (existing > 0) return;

    const samples = [
        { name: "Kopi Hitam", sku: "PRD001", price: 5000, stock: 50 },
        { name: "Teh Manis", sku: "PRD002", price: 4000, stock: 50 },
        { name: "Air Mineral", sku: "PRD003", price: 3000, stock: 60 },
        { name: "Roti Cokelat", sku: "PRD004", price: 7000, stock: 30 },
        { name: "Mie Instan", sku: "PRD005", price: 3500, stock: 40 },
        { name: "Susu Kotak", sku: "PRD006", price: 6000, stock: 25 }
    ];

    await transaction("products", "readwrite", (store) => {
        samples.forEach((product) => store.add(product));
    });
}

async function loadProducts() {
    products = await requestResult(
        db.transaction("products", "readonly")
            .objectStore("products")
            .getAll()
    );

    renderProducts();
}

function renderProducts() {
    const keyword = $("product-search").value.trim().toLowerCase();

    const filtered = products.filter((product) =>
        product.name.toLowerCase().includes(keyword) ||
        product.sku.toLowerCase().includes(keyword)
    );

    $("product-count").textContent = `${filtered.length} produk`;

    const container = $("product-list");
    container.replaceChildren();

    if (!filtered.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Produk tidak ditemukan.";
        container.append(empty);
        return;
    }

    filtered.forEach((product) => {
        const card = document.createElement("article");
        card.className = "product-card";

        const name = document.createElement("h3");
        name.textContent = product.name;

        const sku = document.createElement("small");
        sku.className = "muted";
        sku.textContent = `${product.sku} · Stok ${product.stock}`;

        const price = document.createElement("p");
        price.textContent = rupiah(product.price);

        const button = document.createElement("button");
        button.textContent = product.stock > 0 ? "Tambah ke keranjang" : "Stok habis";
        button.disabled = product.stock <= 0;
        button.addEventListener("click", () => addToCart(product.id));

        card.append(name, sku, price, button);
        container.append(card);
    });
}

function addToCart(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) return;

    const item = cart.find((entry) => entry.productId === productId);
    const quantity = item ? item.quantity : 0;

    if (quantity >= product.stock) {
        alert("Jumlah melebihi stok yang tersedia.");
        return;
    }

    if (item) {
        item.quantity++;
    } else {
        cart.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: 1
        });
    }

    renderCart();
}

function removeFromCart(productId) {
    cart = cart.filter((item) => item.productId !== productId);
    renderCart();
}

function calculateTotal() {
    return cart.reduce(
        (total, item) => total + item.price * item.quantity,
        0
    );
}

function renderCart() {
    const container = $("cart-list");
    container.replaceChildren();

    if (!cart.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "Keranjang masih kosong";
        container.append(empty);
    }

    cart.forEach((item) => {
        const row = document.createElement("div");
        row.className = "cart-item";

        const description = document.createElement("span");
        description.textContent =
            `${item.name} × ${item.quantity} · ${rupiah(item.price * item.quantity)}`;

        const remove = document.createElement("button");
        remove.textContent = "Hapus";
        remove.addEventListener("click", () => removeFromCart(item.productId));

        row.append(description, remove);
        container.append(row);
    });

    const total = calculateTotal();

    $("cart-count").textContent =
        `${cart.reduce((sum, item) => sum + item.quantity, 0)} item`;

    $("subtotal").textContent = rupiah(total);
    $("total").textContent = rupiah(total);

    updateChange();
}

function updateChange() {
    const total = calculateTotal();
    const cash = Math.max(0, Number($("cash").value) || 0);

    $("change").textContent = rupiah(Math.max(0, cash - total));
    $("checkout").disabled = !cart.length || cash < total;
}

async function checkout() {
    if (!cart.length) return;

    const total = calculateTotal();
    const cash = Math.floor(Number($("cash").value));

    if (!Number.isSafeInteger(cash) || cash < total) {
        alert("Uang pembayaran tidak mencukupi.");
        return;
    }

    const items = cart.map((item) => ({ ...item }));
    const createdAt = new Date().toISOString();

    $("checkout").disabled = true;

    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(
                ["products", "transactions"],
                "readwrite"
            );

            const productStore = tx.objectStore("products");
            const transactionStore = tx.objectStore("transactions");

            const getRequests = items.map((item) =>
                requestResult(productStore.get(item.productId))
            );

            Promise.all(getRequests).then((currentProducts) => {
                for (let i = 0; i < items.length; i++) {
                    const product = currentProducts[i];
                    const item = items[i];

                    if (!product || product.stock < item.quantity) {
                        tx.abort();
                        reject(new Error(
                            `Stok ${item.name} tidak mencukupi. Muat ulang produk.`
                        ));
                        return;
                    }
                }

                currentProducts.forEach((product, index) => {
                    product.stock -= items[index].quantity;
                    productStore.put(product);
                });

                transactionStore.add({
                    createdAt,
                    items,
                    subtotal: total,
                    total,
                    cash,
                    change: cash - total
                });
            }).catch((error) => {
                try { tx.abort(); } catch (_) {}
                reject(error);
            });

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(
                tx.error || new Error("Checkout dibatalkan.")
            );
        });

        cart = [];
        $("cash").value = "";

        await loadProducts();
        renderCart();
        await loadTransactions();

        alert("Transaksi berhasil disimpan!");

    } catch (error) {
        alert(error.message || "Transaksi gagal.");
        await loadProducts();
    } finally {
        updateChange();
    }
}

async function loadTransactions() {
    const records = await requestResult(
        db.transaction("transactions", "readonly")
            .objectStore("transactions")
            .getAll()
    );

    records.sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
    );

    const container = $("transaction-list");
    container.replaceChildren();

    if (!records.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Belum ada transaksi.";
        container.append(empty);
        return;
    }

    records.slice(0, 10).forEach((record) => {
        const row = document.createElement("div");
        row.className = "cart-item";

        const date = document.createElement("span");
        date.textContent = new Date(record.createdAt).toLocaleString("id-ID");

        const amount = document.createElement("strong");
        amount.textContent = rupiah(record.total);

        row.append(date, amount);
        container.append(row);
    });
}

function updateConnectionStatus() {
    const online = navigator.onLine;
    const status = $("connection-status");

    status.lastElementChild.textContent = online ? "Online" : "Offline";
    status.querySelector(".status-dot").style.background =
        online ? "#28d17c" : "#ff7373";
}

async function initialize() {
    try {
        if (!("indexedDB" in window)) {
            throw new Error("Browser tidak mendukung IndexedDB.");
        }

        db = await openDatabase();

        await seedProducts();
        await loadProducts();
        await loadTransactions();

        $("today").textContent =
            new Date().toLocaleDateString("id-ID", {
                dateStyle: "long"
            });

        $("year").textContent = new Date().getFullYear();

        $("product-search").addEventListener("input", renderProducts);
        $("cash").addEventListener("input", updateChange);
        $("checkout").addEventListener("click", checkout);

        updateConnectionStatus();

        window.addEventListener("online", updateConnectionStatus);
        window.addEventListener("offline", updateConnectionStatus);

    } catch (error) {
        console.error(error);
        alert("Aplikasi gagal dibuka: " + error.message);
    }
}

initialize();

// Registrasi PWA Service Worker
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js")
            .then((registration) => {
                console.log("ELCICA POS Service Worker aktif:", registration.scope);
            })
            .catch((error) => {
                console.error("Service Worker gagal:", error);
            });
    });
}
