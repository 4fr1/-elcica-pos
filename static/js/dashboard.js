/* Dashboard ELCICA POS — data lokal dari IndexedDB + identitas dari /api/me */
const DB_NAME = "elcica-pos-db";
const DB_VERSION = 1;

const $ = (id) => document.getElementById(id);
const rupiah = (value) => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0
}).format(value || 0);

let db;

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains("products")) {
                database.createObjectStore("products", { keyPath: "id", autoIncrement: true });
            }
            if (!database.objectStoreNames.contains("transactions")) {
                const store = database.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
                store.createIndex("createdAt", "createdAt");
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAll(storeName) {
    return new Promise((resolve, reject) => {
        const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

function dayKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderStats(products, transactions) {
    const today = dayKey(new Date());
    const todayTx = transactions.filter((t) => dayKey(t.createdAt) === today);
    const sales = todayTx.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    const low = products.filter((p) => Number(p.stock) <= 5).length;

    $("stat-sales").textContent = rupiah(sales);
    $("hero-sales").textContent = rupiah(sales);
    $("stat-orders").textContent = String(todayTx.length);
    $("stat-products").textContent = String(products.length);
    $("stat-low").textContent = String(low);
}

function renderChart(transactions) {
    const days = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = dayKey(d);
        const total = transactions
            .filter((t) => dayKey(t.createdAt) === key)
            .reduce((sum, t) => sum + (Number(t.total) || 0), 0);
        days.push({ key, label: d.toLocaleDateString("id-ID", { weekday: "short" }), total });
    }

    const peak = Math.max(...days.map((d) => d.total), 1);
    const container = $("chart");
    container.replaceChildren();

    days.forEach((day, index) => {
        const col = document.createElement("div");
        col.className = "chart-col" + (index === 6 ? " today" : "");

        const bar = document.createElement("div");
        bar.className = "chart-bar";
        bar.style.height = day.total > 0 ? `${Math.max(8, Math.round(day.total / peak * 100))}%` : "4%";
        bar.title = rupiah(day.total);

        const label = document.createElement("span");
        label.textContent = day.label;

        col.append(bar, label);
        container.append(col);
    });

    const weekTotal = days.reduce((sum, d) => sum + d.total, 0);
    $("chart-total").textContent = rupiah(weekTotal);
}

function renderTransactions(transactions) {
    const container = $("recent-transactions");
    container.replaceChildren();

    const recent = [...transactions]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 5);

    if (!recent.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "Belum ada transaksi. Buka kasir untuk mulai berjualan.";
        container.append(empty);
        return;
    }

    recent.forEach((record) => {
        const row = document.createElement("div");
        row.className = "list-row";

        const info = document.createElement("div");
        const when = document.createElement("span");
        when.textContent = new Date(record.createdAt).toLocaleDateString("id-ID", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
        });
        const items = document.createElement("small");
        const count = (record.items || []).reduce((n, item) => n + (item.quantity || 0), 0);
        items.textContent = `${count} item · ${(record.items || []).length} produk`;
        info.append(when, items);

        const amount = document.createElement("strong");
        amount.textContent = rupiah(record.total);

        row.append(info, amount);
        container.append(row);
    });
}

function renderProducts(products) {
    const container = $("recent-products");
    container.replaceChildren();

    if (!products.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "Belum ada produk. Buka kasir sekali untuk mengisi contoh produk.";
        container.append(empty);
        return;
    }

    products.slice(-4).reverse().forEach((product) => {
        const tile = document.createElement("div");
        tile.className = "product-tile";

        const name = document.createElement("strong");
        name.textContent = product.name;

        const meta = document.createElement("small");
        meta.textContent = `${product.sku || "tanpa SKU"} · stok ${product.stock}`;

        const price = document.createElement("b");
        price.textContent = rupiah(product.price);
        if (Number(product.stock) <= 5) price.className = "low";

        tile.append(name, meta, price);
        container.append(tile);
    });
}

async function loadAccount() {
    const chip = $("account-chip");
    let me = null;

    try {
        const res = await fetch("/api/me", { credentials: "same-origin" });
        if (res.ok) me = await res.json();
    } catch (_) {
        // Offline: biarkan tampil sebagai tamu.
    }

    if (!me) {
        chip.lastChild.textContent = "Belum login";
        $("account-name").textContent = "Tamu";
        $("account-email").textContent = "Belum login";
        $("account-role").textContent = "AKUN LOKAL";
        $("greeting-name").textContent = "Tamu";
        chip.addEventListener("click", () => {
            location.href = "https://auth.elcica.xyz/login";
        }, { once: true });
        return;
    }

    chip.classList.add("logged-in");
    chip.lastChild.textContent = me.name || me.email;
    $("account-name").textContent = me.name || "Pengguna";
    $("account-email").textContent = me.email;
    $("account-role").textContent = String(me.role || "user").toUpperCase();
    $("greeting-name").textContent = (me.name || "Pengguna").split(" ")[0];
    chip.addEventListener("click", () => {
        location.href = "https://auth.elcica.xyz/admin";
    });
}

function updateConnectionStatus() {
    const online = navigator.onLine;
    const status = $("connection-status");
    status.classList.toggle("offline", !online);
    status.lastElementChild.textContent = online ? "Online" : "Offline";
}

let toastTimer;
function showToast(message) {
    const toast = $("toast");
    toast.textContent = `${message} — fitur ini belum tersedia.`;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function setupNavigation() {
    const close = () => document.body.classList.remove("menu-open");
    $("menu-btn").addEventListener("click", () => document.body.classList.add("menu-open"));
    $("close-btn").addEventListener("click", close);
    $("sidebar-overlay").addEventListener("click", close);
    document.querySelectorAll("#sidebar .nav-link").forEach((link) => {
        link.addEventListener("click", close);
    });
    document.querySelectorAll("[data-soon]").forEach((button) => {
        button.addEventListener("click", () => showToast(button.dataset.soon));
    });
    $("account-chip").addEventListener("click", () => document.body.classList.remove("menu-open"));
}

async function initialize() {
    try {
        if (!("indexedDB" in window)) throw new Error("Browser tidak mendukung IndexedDB.");
        db = await openDatabase();

        const [products, transactions] = await Promise.all([
            getAll("products"), getAll("transactions")
        ]);

        renderStats(products, transactions);
        renderChart(transactions);
        renderTransactions(transactions);
        renderProducts(products);

        $("today").textContent = new Date().toLocaleDateString("id-ID", { dateStyle: "full" });
        $("year").textContent = new Date().getFullYear();

        updateConnectionStatus();
        window.addEventListener("online", updateConnectionStatus);
        window.addEventListener("offline", updateConnectionStatus);
    } catch (error) {
        console.error("Dashboard gagal dimuat:", error);
        showToast("Gagal memuat data lokal");
    }

    setupNavigation();
    await loadAccount();
}

initialize();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js")
            .catch((error) => console.error("Service Worker gagal:", error));
    });
}
