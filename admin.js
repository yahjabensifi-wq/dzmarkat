/* DZMARKAT admin panel — Supabase Auth + row-level policies */
const { createClient } = supabase;
const db = createClient(STORE_CONFIG.SUPABASE_URL, STORE_CONFIG.SUPABASE_KEY);
const $ = id => document.getElementById(id);

let categories = [];
let editingProduct = null;
let productsCache = [];
let imageInputs = [];

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  })[char]);
}

async function login(event) {
  event.preventDefault();
  const email = $("email")?.value.trim() || "";
  const password = $("password")?.value || "";
  const message = $("loginMsg");
  if (message) message.textContent = "";
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    if (message) message.textContent = "تعذر الدخول. تحقق من البريد وكلمة المرور.";
    console.error("Admin login failed:", error);
    return;
  }
  await init();
}

async function init() {
  const loginBox = $("loginBox");
  const dashboard = $("dashboard");
  const message = $("loginMsg");
  try {
    const { data: { user }, error: userError } = await db.auth.getUser();
    if (userError) throw userError;
    if (!user) {
      if (loginBox) loginBox.style.display = "block";
      if (dashboard) dashboard.style.display = "none";
      return;
    }

    const { data: admin, error: adminError } = await db.from("admins")
      .select("id,is_admin").eq("id", user.id).maybeSingle();
    if (adminError) throw adminError;
    if (!admin?.is_admin) {
      await db.auth.signOut();
      if (loginBox) loginBox.style.display = "block";
      if (dashboard) dashboard.style.display = "none";
      if (message) message.textContent = "هذا الحساب غير مخوّل لإدارة المتجر.";
      return;
    }

    if (loginBox) loginBox.style.display = "none";
    if (dashboard) dashboard.style.display = "block";
    await loadCategories();
    await Promise.all([loadProducts(), loadOrders()]);
  } catch (error) {
    console.error("Admin initialization failed:", error);
    if (loginBox) loginBox.style.display = "block";
    if (dashboard) dashboard.style.display = "none";
    if (message) message.textContent = `تعذر فتح لوحة الإدارة: ${error.message || "خطأ غير معروف"}`;
  }
}

async function loadCategories() {
  const select = $("pcat");
  const { data, error } = await db.from("categories").select("*").order("name");
  if (error) throw error;
  categories = data || [];
  if (select) {
    select.innerHTML = categories.map(category =>
      `<option value="${Number(category.id)}">${safe(category.icon || "🛍️")} ${safe(category.name)}</option>`
    ).join("");
  }
}

async function loadProducts() {
  const container = $("adminProducts");
  const { data, error } = await db.from("products")
    .select("*,categories(name),product_images(id,product_id,image_url,sort_order)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Unable to load admin products:", error);
    if (container) container.innerHTML = '<p class="note">تعذر تحميل المنتجات. تحقق من اتصال قاعدة البيانات والصلاحيات.</p>';
    return;
  }
  productsCache = data || [];
  if (!container) return;
  container.innerHTML = productsCache.map(product => {
    const images = (product.product_images || []).slice()
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const cover = product.image_url || images[0]?.image_url || "";
    return `<article class="card">
      <div class="noimg">${cover ? `<img src="${safe(cover)}" alt="${safe(product.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : "🛍️"}</div>
      <div class="cardbody">
        <small>${safe(product.categories?.name || "")}</small>
        <h3>${safe(product.name || "منتج")}</h3>
        <small>${images.length ? `📷 ${images.length} صور محفوظة` : "لا توجد صور إضافية"}</small>
        <div class="price">${Number(product.price || 0).toLocaleString("ar-DZ")} دج</div>
        <div class="row"><button type="button" class="main-btn" onclick="editProductById(${Number(product.id)})">تعديل</button><button type="button" class="danger" onclick="del(${Number(product.id)})">حذف</button></div>
      </div>
    </article>`;
  }).join("") || '<p class="note">لا توجد منتجات حتى الآن.</p>';
}

function editProductById(id) {
  const product = productsCache.find(item => Number(item.id) === Number(id));
  if (product) editProduct(product);
}

function resetImagePickers() {
  imageInputs = [];
  const pickers = $("imagePickers");
  const preview = $("imagePreview");
  if (pickers) pickers.replaceChildren();
  if (preview) preview.replaceChildren();
  addImagePicker();
  renderImagePreview();
}

function addImagePicker() {
  const pickers = $("imagePickers");
  if (!pickers) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp,image/gif,image/avif";
  input.multiple = true;
  input.style.cssText = "display:block;width:100%;margin:6px 0";
  input.addEventListener("change", renderImagePreview);
  pickers.appendChild(input);
  imageInputs.push(input);
}

function renderImagePreview() {
  const preview = $("imagePreview");
  if (!preview) return;
  preview.replaceChildren();

  const existing = editingProduct ? [
    editingProduct.image_url,
    ...(editingProduct.product_images || []).map(image => image.image_url)
  ].filter((url, index, list) => url && list.indexOf(url) === index) : [];
  for (const url of existing) {
    const wrapper = document.createElement("div");
    wrapper.className = "admin-image-preview";
    const image = document.createElement("img");
    image.src = url;
    image.alt = "صورة محفوظة";
    wrapper.appendChild(image);
    const label = document.createElement("small");
    label.textContent = "محفوظة";
    wrapper.appendChild(label);
    preview.appendChild(wrapper);
  }

  for (const input of imageInputs) {
    for (const file of Array.from(input.files || [])) {
      const wrapper = document.createElement("div");
      wrapper.className = "admin-image-preview";
      const image = document.createElement("img");
      image.src = URL.createObjectURL(file);
      image.alt = file.name;
      wrapper.appendChild(image);
      const label = document.createElement("small");
      label.textContent = file.name;
      wrapper.appendChild(label);
      preview.appendChild(wrapper);
    }
  }
}

function showAdd() {
  editingProduct = null;
  $("formTitle").textContent = "إضافة منتج";
  $("productForm")?.reset();
  if ($("oldimage")) $("oldimage").value = "";
  resetImagePickers();
  if ($("productModal")) $("productModal").style.display = "block";
}

function editProduct(product) {
  editingProduct = product;
  $("pname").value = product.name || "";
  $("pprice").value = product.price ?? "";
  $("pcat").value = product.category_id ?? "";
  $("pdesc").value = product.description || "";
  $("oldimage").value = product.image_url || "";
  $("formTitle").textContent = "تعديل المنتج";
  resetImagePickers();
  if ($("productModal")) $("productModal").style.display = "block";
}

function closeP() {
  if ($("productModal")) $("productModal").style.display = "none";
}

async function saveProduct(event) {
  event.preventDefault();
  const saveButton = $("productForm")?.querySelector('button[type="submit"], button:not([type])');
  if (saveButton) { saveButton.disabled = true; saveButton.textContent = "جارٍ الحفظ..."; }

  try {
    const name = $("pname").value.trim();
    const price = Number($("pprice").value);
    const categoryId = Number($("pcat").value);
    const description = $("pdesc").value.trim();
    let imageUrl = $("oldimage").value || "";
    const files = imageInputs.flatMap(input => Array.from(input.files || []));
    const uploadedUrls = [];

    if (!name || !Number.isFinite(price) || price < 0 || !categoryId) {
      alert("يرجى إدخال اسم المنتج وسعر صحيح واختيار القسم.");
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        alert(`الملف ${file.name} ليس صورة صالحة.`);
        return;
      }
      const originalExt = (file.name.split(".").pop() || "jpg").toLowerCase();
      const ext = /^[a-z0-9]{2,5}$/.test(originalExt) ? originalExt : "jpg";
      const path = `products/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const upload = await db.storage.from("product-images").upload(path, file, { upsert: false });
      if (upload.error) throw new Error(`تعذر رفع الصورة ${file.name}: ${upload.error.message}`);
      const publicUrl = db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      uploadedUrls.push(publicUrl);
      if (!imageUrl) imageUrl = publicUrl;
    }

    const row = {
      name,
      price,
      category_id: categoryId,
      description,
      image_url: imageUrl,
      active: true
    };
    let productId;
    if (editingProduct) {
      const result = await db.from("products").update(row).eq("id", editingProduct.id);
      if (result.error) throw result.error;
      productId = editingProduct.id;
    } else {
      const result = await db.from("products").insert(row).select("id").single();
      if (result.error) throw result.error;
      productId = result.data.id;
    }

    if (uploadedUrls.length) {
      const existingOrders = (editingProduct?.product_images || []).map(item => Number(item.sort_order || 0));
      const firstOrder = existingOrders.length ? Math.max(...existingOrders) + 1 : 0;
      const rows = uploadedUrls.map((url, index) => ({
        product_id: productId,
        image_url: url,
        sort_order: firstOrder + index
      }));
      const imagesResult = await db.from("product_images").insert(rows);
      if (imagesResult.error) {
        throw new Error(`حُفظ المنتج، لكن تعذر ربط الصور الإضافية به: ${imagesResult.error.message}`);
      }
    }

    closeP();
    await loadProducts();
    alert("تم حفظ المنتج بنجاح ✅");
  } catch (error) {
    console.error("Product save failed:", error);
    alert(`تعذر حفظ المنتج.\nالسبب: ${error.message || "خطأ غير معروف"}`);
  } finally {
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = "حفظ المنتج"; }
  }
}

async function del(id) {
  if (!confirm("هل تريد حذف هذا المنتج؟")) return;
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) {
    console.error("Product deletion failed:", error);
    alert(`تعذر حذف المنتج: ${error.message || "تحقق من صلاحيات قاعدة البيانات."}`);
    return;
  }
  await loadProducts();
}

let ordersCache = [];
let orderItemsById = new Map();

function money(value) {
  return `${Number(value || 0).toLocaleString("ar-DZ", { maximumFractionDigits: 2 })} دج`;
}

function orderDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-DZ");
}

function selectedStatusOptions(current) {
  const statuses = ["جديد", "تم التأكيد", "قيد الشحن", "تم التسليم", "ملغى"];
  return statuses.map(status =>
    `<option value="${safe(status)}" ${current === status ? "selected" : ""}>${safe(status)}</option>`
  ).join("");
}

async function loadOrders() {
  const tbody = $("ordersTableBody");
  const mobileList = $("ordersMobileList");
  const message = $("ordersMessage");
  if (tbody) tbody.innerHTML = '<tr><td colspan="8">جارٍ تحميل الطلبيات...</td></tr>';
  if (mobileList) mobileList.innerHTML = '<p class="note">جارٍ تحميل الطلبيات...</p>';
  if (message) message.style.display = "none";

  try {
    const { data, error } = await db.from("orders")
      .select("id,customer_name,phone,wilaya,address,delivery_method,payment_method,total,status,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    ordersCache = data || [];
    orderItemsById = new Map();
    if (ordersCache.length) {
      const ids = ordersCache.map(order => order.id);
      const { data: itemRows, error: itemError } = await db.from("order_items")
        .select("id,order_id,product_id,product_name,price,quantity")
        .in("order_id", ids);
      if (itemError) {
        console.error("Unable to load order line items:", itemError);
        if (message) {
          message.textContent = "تم تحميل الطلبيات، لكن تعذر تحميل بعض تفاصيل المنتجات. تحقق من صلاحيات order_items.";
          message.style.display = "block";
        }
      } else {
        for (const item of itemRows || []) {
          const key = String(item.order_id);
          if (!orderItemsById.has(key)) orderItemsById.set(key, []);
          orderItemsById.get(key).push(item);
        }
      }
    }

    renderOrderStats();
    filterOrders();
  } catch (error) {
    console.error("Unable to load orders:", error);
    const text = `تعذر تحميل الطلبيات: ${error.message || "خطأ غير معروف"}`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="8">${safe(text)}</td></tr>`;
    if (mobileList) mobileList.innerHTML = `<p class="note">${safe(text)}</p>`;
    if (message) { message.textContent = text; message.style.display = "block"; }
  }
}

function renderOrderStats() {
  const total = ordersCache.length;
  const countStatus = status => ordersCache.filter(order => (order.status || "جديد") === status).length;
  const value = ordersCache
    .filter(order => order.status !== "ملغى")
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  if ($("statTotal")) $("statTotal").textContent = total.toLocaleString("ar-DZ");
  if ($("statNew")) $("statNew").textContent = countStatus("جديد").toLocaleString("ar-DZ");
  if ($("statShipping")) $("statShipping").textContent = countStatus("قيد الشحن").toLocaleString("ar-DZ");
  if ($("statDelivered")) $("statDelivered").textContent = countStatus("تم التسليم").toLocaleString("ar-DZ");
  if ($("statValue")) $("statValue").textContent = money(value);
}

function orderMatchesFilters(order, query, statusFilter) {
  if (statusFilter && (order.status || "جديد") !== statusFilter) return false;
  if (!query) return true;
  const searchable = [order.id, order.customer_name, order.phone, order.wilaya, order.address]
    .map(value => String(value ?? "").toLocaleLowerCase())
    .join(" ");
  return searchable.includes(query);
}

function filterOrders() {
  const query = ($("orderSearch")?.value || "").trim().toLocaleLowerCase();
  const statusFilter = $("orderStatusFilter")?.value || "";
  const filtered = ordersCache.filter(order => orderMatchesFilters(order, query, statusFilter));
  renderOrdersTable(filtered);
  renderOrdersMobile(filtered);
  const count = $("ordersCount");
  if (count) count.textContent = `عرض ${filtered.length.toLocaleString("ar-DZ")} من ${ordersCache.length.toLocaleString("ar-DZ")} طلب`;
}

function orderDetailsHtml(order) {
  const items = orderItemsById.get(String(order.id)) || [];
  const itemsHtml = items.length
    ? `<div class="order-items-table-wrap"><table class="order-items-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead><tbody>${items.map(item => {
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || 0);
        return `<tr><td>${safe(item.product_name || "منتج")}</td><td>${quantity.toLocaleString("ar-DZ")}</td><td>${money(price)}</td><td>${money(price * quantity)}</td></tr>`;
      }).join("")}</tbody></table></div>`
    : '<p class="note">لا توجد تفاصيل منتجات محفوظة لهذا الطلب، أو تعذر تحميلها.</p>';
  const phoneText = String(order.phone || "").trim();
  const phoneLink = phoneText ? `<a class="order-contact" href="tel:${safe(phoneText)}">اتصال بالزبون</a>` : "";
  return `<div class="order-detail-grid">
    <div><small>اسم الزبون</small><strong>${safe(order.customer_name || "—")}</strong></div>
    <div><small>رقم الهاتف</small><strong>${safe(phoneText || "—")}</strong></div>
    <div><small>الولاية</small><strong>${safe(order.wilaya || "—")}</strong></div>
    <div><small>العنوان</small><strong>${safe(order.address || "—")}</strong></div>
    <div><small>طريقة التوصيل</small><strong>${safe(order.delivery_method || "—")}</strong></div>
    <div><small>طريقة الدفع</small><strong>${safe(order.payment_method || "الدفع عند الاستلام")}</strong></div>
    <div><small>تاريخ الطلب</small><strong>${safe(orderDate(order.created_at))}</strong></div>
    <div><small>الإجمالي المسجل</small><strong>${money(order.total)}</strong></div>
  </div>
  <h4 class="order-details-heading">المنتجات المطلوبة</h4>${itemsHtml}<div class="order-detail-actions">${phoneLink}<button type="button" class="danger" onclick="printOrder(${Number(order.id)})">طباعة التفاصيل</button></div>`;
}

function renderOrdersTable(list) {
  const tbody = $("ordersTableBody");
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="note">لا توجد طلبيات مطابقة للبحث أو التصفية.</div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(order => {
    const id = Number(order.id);
    const status = order.status || "جديد";
    return `<tr class="order-main-row">
      <td><strong>#${id}</strong><small class="order-date">${safe(orderDate(order.created_at))}</small></td>
      <td>${safe(order.customer_name || "—")}</td>
      <td>${safe(order.phone || "—")}</td>
      <td>${safe(order.wilaya || "—")}</td>
      <td>${safe(order.delivery_method || "—")}</td>
      <td><strong>${money(order.total)}</strong></td>
      <td><select class="status order-status" aria-label="حالة الطلب ${id}" onchange="updateOrderStatus(${id},this.value)">${selectedStatusOptions(status)}</select></td>
      <td><button id="desktop-button-${id}" type="button" class="order-details-button" onclick="toggleOrderDetails(${id},'desktop')">التفاصيل</button></td>
    </tr><tr id="desktop-details-${id}" class="order-details-row" hidden><td colspan="8">${orderDetailsHtml(order)}</td></tr>`;
  }).join("");
}

function renderOrdersMobile(list) {
  const container = $("ordersMobileList");
  if (!container) return;
  if (!list.length) {
    container.innerHTML = '<div class="note">لا توجد طلبيات مطابقة للبحث أو التصفية.</div>';
    return;
  }
  container.innerHTML = list.map(order => {
    const id = Number(order.id);
    const status = order.status || "جديد";
    return `<article class="admin-order-card">
      <div class="admin-order-card-head"><strong>طلب #${id}</strong><span>${safe(orderDate(order.created_at))}</span></div>
      <div class="admin-order-card-customer"><strong>${safe(order.customer_name || "—")}</strong><a href="tel:${safe(order.phone || "")}">${safe(order.phone || "لا يوجد هاتف")}</a></div>
      <div class="admin-order-card-meta"><span>📍 ${safe(order.wilaya || "—")}</span><strong>${money(order.total)}</strong></div>
      <label class="mobile-status-label">حالة الطلب<select class="status order-status" aria-label="حالة الطلب ${id}" onchange="updateOrderStatus(${id},this.value)">${selectedStatusOptions(status)}</select></label>
      <button id="mobile-button-${id}" type="button" class="order-details-button mobile-details-button" onclick="toggleOrderDetails(${id},'mobile')">عرض التفاصيل</button>
      <div id="mobile-details-${id}" class="mobile-order-details" hidden>${orderDetailsHtml(order)}</div>
    </article>`;
  }).join("");
}

function toggleOrderDetails(id, view) {
  const target = $(`${view}-details-${id}`);
  if (!target) return;
  target.hidden = !target.hidden;
  const button = $(`${view}-button-${id}`);
  if (button) button.textContent = target.hidden ? (view === "mobile" ? "عرض التفاصيل" : "التفاصيل") : "إخفاء التفاصيل";
}

function printOrder(id) {
  const order = ordersCache.find(item => Number(item.id) === Number(id));
  if (!order) return;
  const printWindow = window.open("", "_blank", "width=800,height=700");
  if (!printWindow) {
    alert("اسمح بفتح نافذة الطباعة من إعدادات المتصفح ثم أعد المحاولة.");
    return;
  }
  printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طلب #${Number(order.id)} - DZMARKAT</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#20253b}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #ddd;padding:9px;text-align:right}.meta{line-height:2}.sum{font-weight:bold;margin-top:18px}</style></head><body><h1>DZMARKAT — طلب #${Number(order.id)}</h1><div class="meta">الزبون: ${safe(order.customer_name)}<br>الهاتف: ${safe(order.phone)}<br>الولاية: ${safe(order.wilaya)}<br>العنوان: ${safe(order.address)}<br>طريقة التوصيل: ${safe(order.delivery_method)}<br>طريقة الدفع: ${safe(order.payment_method || "الدفع عند الاستلام")}<br>التاريخ: ${safe(orderDate(order.created_at))}<br>الحالة: ${safe(order.status || "جديد")}</div><h3>المنتجات</h3>${orderDetailsPrintItems(order)}<p class="sum">الإجمالي المسجل: ${money(order.total)}</p><script>window.onload=()=>window.print();</script></body></html>`);
  printWindow.document.close();
}

function orderDetailsPrintItems(order) {
  const items = orderItemsById.get(String(order.id)) || [];
  if (!items.length) return '<p>لا توجد تفاصيل منتجات محفوظة.</p>';
  return `<table><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead><tbody>${items.map(item => {
    const quantity = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    return `<tr><td>${safe(item.product_name || "منتج")}</td><td>${quantity}</td><td>${money(price)}</td><td>${money(price * quantity)}</td></tr>`;
  }).join("")}</tbody></table>`;
}

async function updateOrderStatus(id, value) {
  const previousOrder = ordersCache.find(order => Number(order.id) === Number(id));
  if (!previousOrder) return;
  const previousStatus = previousOrder.status || "جديد";
  if (previousStatus === value) return;
  const { error } = await db.from("orders").update({ status: value }).eq("id", id);
  if (error) {
    console.error("Order status update failed:", error);
    alert(`تعذر تحديث حالة الطلب: ${error.message || "خطأ غير معروف"}`);
    filterOrders();
    return;
  }
  previousOrder.status = value;
  renderOrderStats();
  filterOrders();
}

function tab(id) {
  if ($("productsTab")) $("productsTab").style.display = id === "productsTab" ? "block" : "none";
  if ($("ordersTab")) $("ordersTab").style.display = id === "ordersTab" ? "block" : "none";
}

async function logout() {
  const { error } = await db.auth.signOut();
  if (error) console.error("Sign-out failed:", error);
  location.reload();
}

init();
