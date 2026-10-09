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

async function loadOrders() {
  const container = $("orders");
  if (!container) return;
  const { data, error } = await db.from("orders").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("Unable to load orders:", error);
    container.innerHTML = '<p class="note">تعذر تحميل الطلبات. تحقق من صلاحيات قاعدة البيانات.</p>';
    return;
  }

  const list = data || [];
  const cards = await Promise.all(list.map(async order => {
    const itemResult = await db.from("order_items")
      .select("product_name,price,quantity").eq("order_id", order.id);
    const itemText = itemResult.error
      ? "تعذر تحميل تفاصيل المنتجات"
      : (itemResult.data || []).map(item =>
          `${safe(item.product_name || "منتج")} × ${Number(item.quantity || 1)} — ${Number(item.price || 0).toLocaleString("ar-DZ")} دج`
        ).join("<br>");
    const statuses = ["جديد", "تم التأكيد", "قيد الشحن", "تم التسليم", "ملغى"];
    const options = statuses.map(status =>
      `<option value="${safe(status)}" ${order.status === status ? "selected" : ""}>${safe(status)}</option>`
    ).join("");
    return `<article class="order">
      <div class="row"><b>طلب #${Number(order.id)}</b><span>${safe(new Date(order.created_at).toLocaleString("ar-DZ"))}</span></div>
      <p>👤 ${safe(order.customer_name)} — 📱 ${safe(order.phone)} — 📍 ${safe(order.wilaya)}</p>
      <p>العنوان: ${safe(order.address)} | ${safe(order.delivery_method)}</p>
      <p><b>المنتجات:</b><br>${itemText || "لا توجد تفاصيل منتجات محفوظة"}</p>
      <p><b>الإجمالي: ${Number(order.total || 0).toLocaleString("ar-DZ")} دج</b> — الدفع عند الاستلام</p>
      <label>حالة الطلب <select class="status" onchange="updateOrderStatus(${Number(order.id)},this.value)">${options}</select></label>
    </article>`;
  }));
  container.innerHTML = cards.join("") || '<p class="note">لا توجد طلبات حتى الآن.</p>';
}

async function updateOrderStatus(id, value) {
  const { error } = await db.from("orders").update({ status: value }).eq("id", id);
  if (error) {
    console.error("Order status update failed:", error);
    alert(`تعذر تحديث حالة الطلب: ${error.message || "خطأ غير معروف"}`);
    return;
  }
  await loadOrders();
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
