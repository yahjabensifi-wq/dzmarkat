const { createClient } = supabase;
const db = createClient(
  STORE_CONFIG.SUPABASE_URL,
  STORE_CONFIG.SUPABASE_KEY
);

let products = [], categories = [], cart = [], active = null;

const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString("ar-DZ") + " دج";

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

// الأسعار: المنزل ثم المكتب، بالدينار الجزائري
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
"تميمون":[1100,700],"برج باجي مختار":[99999,99999],
"أولاد جلال":[800,500],"بني عباس":[1000,1000],
"عين صالح":[1200,900],"عين قزام":[99999,99999],
"تقرت":[800,450],"جانت":[99999,99999],"المغير":[850,850],
"المنيعة":[850,500]
};

function safe(x) {
  return String(x ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;",
    '"':"&quot;", "'":"&#039;"
  }[m]));
}

function hideAdminButton() {
  document.querySelectorAll("button,a").forEach(el => {
    const text = (el.textContent || "").trim();
    const target = el.getAttribute("onclick") || "";
    if (
      text.includes("الإدارة") ||
      target.includes("admin.html")
    ) el.style.display = "none";
  });
}

function getImages(p) {
  const imgs = (p.product_images || [])
    .slice()
    .sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(x => x.image_url)
    .filter(Boolean);

  if (p.image_url && !imgs.includes(p.image_url)) {
    imgs.unshift(p.image_url);
  }
  return imgs;
}

async function load() {
  hideAdminButton();

  const w = $("wilaya");
  if (w) {
    w.innerHTML = '<option value="">اختر الولاية</option>' +
      wilayas.map(x => `<option value="${safe(x)}">${safe(x)}</option>`).join("");
  }

  const form = $("cartModal")?.querySelector("form");
  if (form) form.id = "cartForm";

  const categoryResult = await db.from("categories")
    .select("*").order("name");

  if (categoryResult.error) {
    console.error(categoryResult.error);
    alert("تعذر تحميل الأقسام. تحقق من اتصال قاعدة البيانات.");
  }
  categories = categoryResult.data || [];

  let result = await db.from("products")
    .select("*,categories(name,icon),product_images(id,product_id,image_url,sort_order)")
    .eq("active", true)
    .order("created_at", {ascending:false});

  // محاولة بديلة إذا تعذر جلب علاقة صور المنتج
  if (result.error) {
    console.error(result.error);
    result = await db.from("products")
      .select("*,categories(name,icon)")
      .eq("active", true)
      .order("created_at", {ascending:false});

    products = result.data || [];

    if (products.length) {
      const ids = products.map(p => p.id);
      const imageResult = await db.from("product_images")
        .select("id,product_id,image_url,sort_order")
        .in("product_id", ids);

      if (!imageResult.error) {
        products.forEach(p => {
          p.product_images = (imageResult.data || [])
            .filter(im => Number(im.product_id) === Number(p.id));
        });
      }
    }
  } else {
    products = result.data || [];
  }

  render();
  drawCart();
  setupDelivery();
}

function render() {
  const cats = $("cats"), grid = $("grid");
  if (!cats || !grid) return;

  cats.innerHTML = categories.map(c =>
    `<button type="button" class="cat ${Number(active)===Number(c.id)?"active":""}"
      onclick="filterCat(${Number(c.id)})">
      ${safe(c.icon || "🛍️")} ${safe(c.name || "")}
    </button>`
  ).join("");

  const q = ($("search")?.value || "").trim().toLowerCase();

  const list = products.filter(p =>
    (!active || Number(p.category_id) === Number(active)) &&
    (!q ||
      String(p.name || "").toLowerCase().includes(q) ||
      String(p.description || "").toLowerCase().includes(q))
  );

  grid.innerHTML = list.length ? list.map(p => {
    const imgs = getImages(p);
    const cover = imgs[0] || "";

    return `<article class="card">
      ${cover
        ? `<img src="${safe(cover)}" alt="${safe(p.name)}"
             onclick="openGallery(${Number(p.id)})"
             style="cursor:pointer" onerror="this.style.display='none'">`
        : '<div class="noimg">🛍️</div>'}
      <div class="cardbody">
        <small>${safe(p.categories?.name || "")}</small>
        <h3>${safe(p.name || "منتج")}</h3>
        <p>${safe(p.description || "")}</p>
        <div class="price">${fmt(p.price)}</div>
        ${imgs.length > 1
          ? `<button type="button" class="main-btn"
               style="width:100%;margin-bottom:8px"
               onclick="openGallery(${Number(p.id)})">
               📷 عرض الصور (${imgs.length})
             </button>` : ""}
        <button type="button" class="add"
          onclick="add(${Number(p.id)})">أضف إلى السلة</button>
      </div>
    </article>`;
  }).join("") : "<p>لا توجد منتجات في هذا القسم حاليًا.</p>";
}

function openGallery(id) {
  const p = products.find(x => Number(x.id) === Number(id));
  if (!p) return;

  const imgs = getImages(p);
  if (!imgs.length) return alert("لا توجد صور لهذا المنتج.");

  $("galleryMain").src = imgs[0];
  $("galleryMain").style.display = "block";

  $("galleryThumbs").innerHTML = imgs.map((url,i) =>
    `<img src="${safe(url)}" alt="صورة ${i+1}"
      onclick="document.getElementById('galleryMain').src=this.src"
      style="width:70px;height:70px;object-fit:cover;border-radius:10px;
      cursor:pointer;border:1px solid #ddd"
      onerror="this.style.display='none'">`
  ).join("");

  $("galleryModal").style.display = "block";
}

function closeGallery() {
  $("galleryModal").style.display = "none";
}

function filterCat(id) {
  active = Number(active) === Number(id) ? null : Number(id);
  render();
  $("products")?.scrollIntoView({behavior:"smooth"});
}

function add(id) {
  const p = products.find(x => Number(x.id) === Number(id));
  if (!p) return;
  cart.push(p);
  drawCart();
  alert("تمت إضافة المنتج إلى السلة ✅");
}

function drawCart() {
  $("count").textContent = cart.length;

  $("items").innerHTML = cart.length
    ? cart.map((p,i) => `
      <div class="cartrow">
        <div class="row">
          <span>${safe(p.name)}</span>
          <b>${fmt(p.price)}</b>
          <button type="button" class="danger"
            onclick="cart.splice(${i},1);drawCart()">حذف</button>
        </div>
      </div>`).join("")
    : "السلة فارغة";

  updateDelivery();
}

function openCart() {
  drawCart();
  $("cartModal").style.display = "block";
}

function closeM() {
  $("cartModal").style.display = "none";
}

function deliveryFee() {
  const w = $("wilaya")?.value || "";
  const method = $("delivery")?.value || "";
  const prices = deliveryPrices[w];

  if (!w || !method || !prices) return null;

  const office = method.includes("المكتب");
  const fee = prices[office ? 1 : 0];

  return fee >= 99999 ? null : fee;
}

function setupDelivery() {
  const form = $("cartForm");
  if (!form) return;

  let box = $("deliveryInfo");
  if (!box) {
    box = document.createElement("div");
    box.id = "deliveryInfo";
    box.style.cssText =
      "margin:10px 0;padding:12px;border-radius:10px;background:#f1f5ff;color:#222;line-height:1.9";
    $("delivery").insertAdjacentElement("afterend", box);
  }

  $("wilaya").addEventListener("change", updateDelivery);
  $("delivery").addEventListener("change", updateDelivery);
  updateDelivery();
}

function updateDelivery() {
  const box = $("deliveryInfo");
  if (!box) return;

  const subtotal = cart.reduce((s,p) => s + Number(p.price || 0), 0);
  const w = $("wilaya")?.value || "";
  const method = $("delivery")?.value || "";
  const btn = $("cartForm")?.querySelector('button[type="submit"]');

  if (!w || !method) {
    box.textContent = "اختر الولاية وطريقة الاستلام لمعرفة ثمن التوصيل.";
    $("total").textContent = fmt(subtotal);
    if (btn) btn.disabled = cart.length === 0;
    return;
  }

  const fee = deliveryFee();

  if (fee === null) {
    box.textContent = "التوصيل غير متاح حاليًا لهذه الولاية أو طريقة الاستلام.";
    $("total").textContent = fmt(subtotal) + " — التوصيل غير متاح";
    if (btn) btn.disabled = true;
    return;
  }

  box.innerHTML =
    "ثمن المنتجات: <b>" + fmt(subtotal) + "</b><br>" +
    "ثمن التوصيل: <b>" + fmt(fee) + "</b><br>" +
    "المجموع النهائي: <b>" + fmt(subtotal + fee) + "</b>";

  $("total").textContent = fmt(subtotal + fee);
  if (btn) btn.disabled = cart.length === 0;
}

async function order(e) {
  e.preventDefault();

  if (!cart.length) return alert("السلة فارغة. أضف منتجًا أولًا.");

  const customerName = $("name").value.trim();
  const phoneNumber = $("phone").value.trim();
  const wilayaName = $("wilaya").value;
  const addressText = $("address").value.trim();
  const method = $("delivery").value;
  const fee = deliveryFee();

  if (!customerName || !phoneNumber || !wilayaName || !addressText || !method) {
    return alert("يرجى ملء جميع معلومات الطلب.");
  }

  if (fee === null) {
    return alert("التوصيل غير متاح لهذه الولاية أو طريقة الاستلام.");
  }

  const btn = $("cartForm").querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = "جارٍ تسجيل الطلب...";
  }

  try {
    const subtotal = cart.reduce((s,p) => s + Number(p.price || 0), 0);
    const finalTotal = subtotal + fee;

    // حفظ الطلب في قاعدة بيانات المتجر، دون تحويل الزبون إلى واتساب
    const {data: orderRow, error} = await db.from("orders").insert({
      customer_name: customerName,
      phone: phoneNumber,
      wilaya: wilayaName,
      address: addressText,
      delivery_method: method,
      total: finalTotal,
      status: "جديد"
    }).select().single();

    if (error) throw error;

    const rows = cart.map(p => ({
      order_id: orderRow.id,
      product_id: p.id,
      product_name: p.name,
      price: Number(p.price || 0),
      quantity: 1
    }));

    const itemResult = await db.from("order_items").insert(rows);

    if (itemResult.error) {
      console.error(itemResult.error);
      alert(
        "تم حفظ الطلب رقم " + orderRow.id +
        "، لكن تعذر حفظ تفاصيل المنتجات. أبلغ المدير برقم الطلب."
      );
      return;
    }

    alert(
      "تم تسجيل طلبك بنجاح ✅\n" +
      "رقم الطلب: " + orderRow.id + "\n" +
      "ثمن المنتجات: " + fmt(subtotal) + "\n" +
      "ثمن التوصيل: " + fmt(fee) + "\n" +
      "المجموع النهائي: " + fmt(finalTotal) + "\n" +
      "سيتم التواصل معك لتأكيد الطلب."
    );

    cart = [];
    drawCart();
    $("cartForm").reset();
    updateDelivery();
    closeM();

  } catch (err) {
    console.error("Order error:", err);
    alert(
      "تعذر تسجيل الطلب.\n" +
      "السبب: " + (err?.message || err?.details || "خطأ غير معروف") +
      "\nتحقق من اتصال قاعدة البيانات وصلاحيات تسجيل الطلب."
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "تأكيد الطلب — الدفع عند الاستلام";
    }
    updateDelivery();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  hideAdminButton();
});

load();
