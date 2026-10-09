/* DZMARKAT storefront — coordinated with index.html and Supabase schema */
const { createClient } = supabase;
const db = createClient(STORE_CONFIG.SUPABASE_URL, STORE_CONFIG.SUPABASE_KEY);

let products = [];
let categories = [];
let cart = [];
let activeCategory = null;
let isLoading = false;

const $ = id => document.getElementById(id);
const fmt = value => `${Number(value || 0).toLocaleString("ar-DZ")} دج`;
const unavailableFee = 99999;

const wilayas = [
  "أدرار","الشلف","الأغواط","أم البواقي","باتنة","بجاية","بسكرة","بشار",
  "البليدة","البويرة","تمنراست","تبسة","تلمسان","تيارت","تيزي وزو","الجزائر",
  "الجلفة","جيجل","سطيف","سعيدة","سكيكدة","سيدي بلعباس","عنابة","قالمة",
  "قسنطينة","المدية","مستغانم","المسيلة","معسكر","ورقلة","وهران","البيض",
  "إليزي","برج بوعريريج","بومرداس","الطارف","تندوف","تيسمسيلت","الوادي",
  "خنشلة","سوق أهراس","تيبازة","ميلة","عين الدفلى","النعامة","عين تموشنت",
  "غرداية","غليزان","تميمون","برج باجي مختار","أولاد جلال","بني عباس",
  "عين صالح","عين قزام","تقرت","جانت","المغير","المنيعة"
];

// الأسعار بالترتيب: التوصيل إلى المنزل، ثم التوصيل إلى المكتب.
const deliveryPrices = {
  "أدرار":[1000,500],"الشلف":[600,350],"الأغواط":[800,350],
  "أم البواقي":[600,350],"باتنة":[600,350],"بجاية":[600,350],
  "بسكرة":[800,350],"بشار":[900,500],"البليدة":[450,450],
  "البويرة":[550,350],"تمنراست":[1200,700],"تبسة":[650,350],
  "تلمسان":[600,350],"تيارت":[600,350],"تيزي وزو":[550,350],
  "الجزائر":[300,300],"الجلفة":[800,450],"جيجل":[600,350],
  "سطيف":[600,350],"سعيدة":[650,350],"سكيكدة":[600,350],
  "سيدي بلعباس":[600,350],"عنابة":[600,350],"قالمة":[650,350],
  "قسنطينة":[600,350],"المدية":[550,350],"مستغانم":[650,350],
  "المسيلة":[650,350],"معسكر":[600,350],"ورقلة":[800,450],
  "وهران":[600,350],"البيض":[900,500],"إليزي":[1200,900],
  "برج بوعريريج":[600,350],"بومرداس":[450,300],"الطارف":[650,350],
  "تندوف":[1100,700],"تيسمسيلت":[600,350],"الوادي":[800,450],
  "خنشلة":[650,350],"سوق أهراس":[650,400],"تيبازة":[450,350],
  "ميلة":[650,350],"عين الدفلى":[550,350],"النعامة":[800,450],
  "عين تموشنت":[600,400],"غرداية":[800,450],"غليزان":[600,400],
  "تميمون":[1100,700],"برج باجي مختار":[unavailableFee,unavailableFee],
  "أولاد جلال":[800,500],"بني عباس":[1000,1000],
  "عين صالح":[1200,900],"عين قزام":[unavailableFee,unavailableFee],
  "تقرت":[800,450],"جانت":[unavailableFee,unavailableFee],
  "المغير":[850,850],"المنيعة":[850,500]
};

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  })[char]);
}

function getImages(product) {
  const stored = (product.product_images || [])
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map(image => image.image_url)
    .filter(Boolean);
  const all = [];
  if (product.image_url) all.push(product.image_url);
  for (const url of stored) if (!all.includes(url)) all.push(url);
  return all;
}

async function load() {
  if (isLoading) return;
  isLoading = true;
  const grid = $("grid");
  try {
    const wilayaSelect = $("wilaya");
    if (wilayaSelect) {
      wilayaSelect.innerHTML = '<option value="">اختر الولاية</option>' +
        wilayas.map(name => `<option value="${safe(name)}">${safe(name)}</option>`).join("");
    }

    const categoryResult = await db.from("categories").select("*").order("name");
    if (categoryResult.error) throw new Error(`تعذر تحميل الأقسام: ${categoryResult.error.message}`);
    categories = categoryResult.data || [];

    let productResult = await db.from("products")
      .select("*,categories(name,icon),product_images(id,product_id,image_url,sort_order)")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (!productResult.error) {
      products = productResult.data || [];
    } else {
      // Fallback: fetch products and their images separately if the embed relationship fails.
      console.warn("Product image relationship query failed; retrying separately:", productResult.error);
      productResult = await db.from("products")
        .select("*,categories(name,icon)")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (productResult.error) throw new Error(`تعذر تحميل المنتجات: ${productResult.error.message}`);
      products = productResult.data || [];
      if (products.length) {
        const ids = products.map(product => product.id);
        const imagesResult = await db.from("product_images")
          .select("id,product_id,image_url,sort_order")
          .in("product_id", ids)
          .order("sort_order", { ascending: true });
        if (imagesResult.error) {
          console.warn("Additional product images could not be loaded:", imagesResult.error);
        } else {
          const byProduct = new Map();
          for (const item of imagesResult.data || []) {
            const key = String(item.product_id);
            if (!byProduct.has(key)) byProduct.set(key, []);
            byProduct.get(key).push(item);
          }
          products.forEach(product => {
            product.product_images = byProduct.get(String(product.id)) || [];
          });
        }
      }
    }

    render();
    setupDelivery();
    drawCart();
  } catch (error) {
    console.error("Store loading error:", error);
    if (grid) grid.innerHTML = `<p class="note">${safe(error.message || "تعذر تحميل المتجر.")}</p>`;
  } finally {
    isLoading = false;
  }
}

function render() {
  const categoryContainer = $("cats");
  const grid = $("grid");
  if (!categoryContainer || !grid) return;

  categoryContainer.innerHTML = categories.map(category =>
    `<button type="button" class="cat ${Number(activeCategory) === Number(category.id) ? "active" : ""}"
      onclick="filterCat(${Number(category.id)})">
      <i>${safe(category.icon || "🛍️")}</i><span>${safe(category.name || "")}</span>
    </button>`
  ).join("");

  const query = ($( "search")?.value || "").trim().toLocaleLowerCase("ar");
  const list = products.filter(product =>
    (!activeCategory || Number(product.category_id) === Number(activeCategory)) &&
    (!query || String(product.name || "").toLocaleLowerCase("ar").includes(query) ||
      String(product.description || "").toLocaleLowerCase("ar").includes(query))
  );

  const heading = $("productsHeading");
  const selectedCategory = categories.find(category => Number(category.id) === Number(activeCategory));
  if (heading) heading.textContent = selectedCategory ? selectedCategory.name : "جميع المنتجات";

  if (!list.length) {
    grid.innerHTML = '<p class="note">لا توجد منتجات مطابقة حاليًا.</p>';
    return;
  }

  grid.innerHTML = list.map(product => {
    const images = getImages(product);
    const cover = images[0] || "";
    return `<article class="card">
      ${cover
        ? `<img src="${safe(cover)}" alt="${safe(product.name)}" loading="lazy"
             onclick="openProduct(${Number(product.id)})" style="cursor:pointer"
             onerror="this.style.display='none'">`
        : '<div class="noimg">🛍️</div>'}
      <div class="cardbody">
        <small>${safe(product.categories?.name || "")}</small>
        <h3>${safe(product.name || "منتج")}</h3>
        <p>${safe(product.description || "")}</p>
        <div class="price">${fmt(product.price)}</div>
        ${images.length > 1 ? `<button type="button" class="main-btn view-photos" onclick="openProduct(${Number(product.id)})">📷 عرض الصور (${images.length})</button>` : ""}
        <button type="button" class="add" onclick="add(${Number(product.id)})">أضف إلى السلة</button>
      </div>
    </article>`;
  }).join("");
}

function filterCat(id) {
  activeCategory = Number(activeCategory) === Number(id) ? null : Number(id);
  render();
  $("productsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showAllProducts() {
  activeCategory = null;
  if ($("search")) $("search").value = "";
  render();
  $("productsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openProduct(id) {
  const product = products.find(item => Number(item.id) === Number(id));
  if (!product) return;
  const images = getImages(product);
  const modal = $("productDetailModal");
  const mainImage = $("detailMainImage");
  const thumbs = $("detailThumbs");
  if (!modal || !mainImage || !thumbs) {
    console.error("Product details modal elements are missing from index.html.");
    return alert("تعذر فتح صور المنتج. حدّث الصفحة وحاول مجددًا.");
  }

  mainImage.alt = product.name || "صورة المنتج";
  mainImage.src = images[0] || "";
  mainImage.style.display = images.length ? "block" : "none";
  thumbs.replaceChildren();
  images.forEach((url, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gallery-thumb";
    button.setAttribute("aria-label", `عرض الصورة ${index + 1}`);
    const image = document.createElement("img");
    image.src = url;
    image.alt = `صورة ${index + 1}`;
    image.loading = "lazy";
    button.appendChild(image);
    button.addEventListener("click", () => { mainImage.src = url; });
    thumbs.appendChild(button);
  });

  $("detailCategory").textContent = product.categories?.name || "";
  $("detailName").textContent = product.name || "منتج";
  $("detailPrice").textContent = fmt(product.price);
  $("detailDescription").textContent = product.description || "لا يوجد وصف لهذا المنتج.";
  $("detailAddButton").onclick = () => { add(product.id); closeProduct(); };
  modal.style.display = "block";
}

function closeProduct() {
  const modal = $("productDetailModal");
  if (modal) modal.style.display = "none";
}

function add(id) {
  const product = products.find(item => Number(item.id) === Number(id));
  if (!product) return;
  cart.push(product);
  drawCart();
  alert("تمت إضافة المنتج إلى السلة ✅");
}

function drawCart() {
  const count = $("count");
  const items = $("items");
  if (count) count.textContent = String(cart.length);
  if (items) {
    items.innerHTML = cart.length ? cart.map((product, index) => `
      <div class="cartrow"><div class="row">
        <span>${safe(product.name)}</span><b>${fmt(product.price)}</b>
        <button type="button" class="danger" onclick="removeFromCart(${index})">حذف</button>
      </div></div>`).join("") : "السلة فارغة";
  }
  updateDelivery();
}

function removeFromCart(index) {
  if (index < 0 || index >= cart.length) return;
  cart.splice(index, 1);
  drawCart();
}

function openCart() {
  drawCart();
  if ($("cartModal")) $("cartModal").style.display = "block";
}

function closeM() {
  if ($("cartModal")) $("cartModal").style.display = "none";
}

function deliveryFee() {
  const selectedWilaya = $("wilaya")?.value || "";
  const method = $("delivery")?.value || "";
  const prices = deliveryPrices[selectedWilaya];
  if (!selectedWilaya || !method || !prices) return null;
  const office = method.includes("المكتب");
  const fee = Number(prices[office ? 1 : 0]);
  return !Number.isFinite(fee) || fee >= unavailableFee ? null : fee;
}

function setupDelivery() {
  const wilayaSelect = $("wilaya");
  const deliverySelect = $("delivery");
  if (!wilayaSelect || !deliverySelect) return;

  let box = $("deliveryInfo");
  if (!box) {
    box = document.createElement("div");
    box.id = "deliveryInfo";
    box.className = "delivery-info";
    deliverySelect.insertAdjacentElement("afterend", box);
  }
  if (wilayaSelect.dataset.deliveryListener !== "true") {
    wilayaSelect.addEventListener("change", updateDelivery);
    wilayaSelect.dataset.deliveryListener = "true";
  }
  if (deliverySelect.dataset.deliveryListener !== "true") {
    deliverySelect.addEventListener("change", updateDelivery);
    deliverySelect.dataset.deliveryListener = "true";
  }
  updateDelivery();
}

function updateDelivery() {
  const box = $("deliveryInfo");
  if (!box) return;
  const subtotal = cart.reduce((sum, product) => sum + Number(product.price || 0), 0);
  const selectedWilaya = $("wilaya")?.value || "";
  const method = $("delivery")?.value || "";
  const total = $("total");
  const button = $("cartForm")?.querySelector('button[type="submit"]');

  if (!selectedWilaya || !method) {
    box.textContent = "اختر الولاية وطريقة الاستلام لمعرفة ثمن التوصيل.";
    if (total) total.textContent = fmt(subtotal);
    if (button) button.disabled = cart.length === 0;
    return;
  }

  const fee = deliveryFee();
  if (fee === null) {
    box.textContent = "التوصيل غير متاح حاليًا لهذه الولاية أو طريقة الاستلام.";
    if (total) total.textContent = `${fmt(subtotal)} — التوصيل غير متاح`;
    if (button) button.disabled = true;
    return;
  }

  box.innerHTML = `ثمن المنتجات: <b>${fmt(subtotal)}</b><br>` +
    `ثمن التوصيل: <b>${fmt(fee)}</b><br>` +
    `المجموع النهائي: <b>${fmt(subtotal + fee)}</b>`;
  if (total) total.textContent = fmt(subtotal + fee);
  if (button) button.disabled = cart.length === 0;
}

async function order(event) {
  event.preventDefault();
  if (!cart.length) return alert("السلة فارغة. أضف منتجًا أولًا.");

  const customerName = $("name")?.value.trim() || "";
  const phoneNumber = $("phone")?.value.trim() || "";
  const wilayaName = $("wilaya")?.value || "";
  const addressText = $("address")?.value.trim() || "";
  const method = $("delivery")?.value || "";
  const fee = deliveryFee();

  if (!customerName || !phoneNumber || !wilayaName || !addressText || !method) {
    return alert("يرجى ملء جميع معلومات الطلب.");
  }
  if (fee === null) return alert("التوصيل غير متاح لهذه الولاية أو طريقة الاستلام.");

  const button = $("cartForm")?.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.textContent = "جارٍ تسجيل الطلب...";
  }

  try {
    const subtotal = cart.reduce((sum, product) => sum + Number(product.price || 0), 0);
    const finalTotal = subtotal + fee;
    const orderItems = cart.map(product => ({
      product_id: String(product.id),
      product_name: String(product.name || "منتج"),
      price: Number(product.price || 0),
      quantity: 1
    }));

    // Atomic insert: create_order writes both orders and order_items in one database transaction.
    const { data: orderId, error } = await db.rpc("create_order", {
      p_customer_name: customerName,
      p_phone: phoneNumber,
      p_wilaya: wilayaName,
      p_address: addressText,
      p_delivery_method: method,
      p_total: finalTotal,
      p_items: orderItems
    });
    if (error) throw error;
    if (orderId === null || orderId === undefined) {
      throw new Error("لم تُرجع قاعدة البيانات رقم الطلب.");
    }

    alert(`تم تسجيل طلبك بنجاح ✅\nرقم الطلب: ${orderId}\nثمن المنتجات: ${fmt(subtotal)}\nثمن التوصيل: ${fmt(fee)}\nالمجموع النهائي: ${fmt(finalTotal)}\nسيتم التواصل معك لتأكيد الطلب.`);
    cart = [];
    $("cartForm")?.reset();
    drawCart();
    closeM();
  } catch (error) {
    console.error("Order creation failed:", error);
    alert(`تعذر تسجيل الطلب.\nالسبب: ${error?.message || error?.details || "خطأ غير معروف"}\nلم يتم تأكيد الطلب؛ يرجى المحاولة مرة أخرى لاحقًا.`);
  } finally {
    if (button) button.textContent = "تأكيد الطلب — الدفع عند الاستلام";
    updateDelivery();
  }
}

// Close modals when the dark backdrop itself is tapped.
document.addEventListener("click", event => {
  if (event.target === $("cartModal")) closeM();
  if (event.target === $("productDetailModal")) closeProduct();
});

load();
