const {createClient}=supabase;
const db=createClient(STORE_CONFIG.SUPABASE_URL,STORE_CONFIG.SUPABASE_KEY);
let products=[],categories=[],cart=[],active=null;
const wilayas=["أدرار","الشلف","الأغواط","أم البواقي","باتنة","بجاية","بسكرة","بشار","البليدة","البويرة","تمنراست","تبسة","تلمسان","تيارت","تيزي وزو","الجزائر","الجلفة","جيجل","سطيف","سعيدة","سكيكدة","سيدي بلعباس","عنابة","قالمة","قسنطينة","المدية","مستغانم","المسيلة","معسكر","ورقلة","وهران","البيض","إليزي","برج بوعريريج","بومرداس","الطارف","تندوف","تيسمسيلت","الوادي","خنشلة","سوق أهراس","تيبازة","ميلة","عين الدفلى","النعامة","عين تموشنت","غرداية","غليزان","تميمون","برج باجي مختار","أولاد جلال","بني عباس","عين صالح","عين قزام","تقرت","جانت","المغير","المنيعة"];
wilaya.innerHTML='<option value="">اختر الولاية</option>'+wilayas.map(x=>`<option>${x}</option>`).join("");

async function load(){
  const c=await db.from("categories").select("*").order("name");
  categories=c.data||[];
  const p=await db.from("products").select("*,categories(name,icon),product_images(id,image_url,sort_order)").eq("active",true).order("created_at",{ascending:false});
  products=p.data||[];
  render();
}
function productImages(p){
  const imgs=(p.product_images||[]).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(x=>x.image_url);
  if(p.image_url&&!imgs.includes(p.image_url))imgs.unshift(p.image_url);
  return imgs;
}
function render(){
  cats.innerHTML=categories.map(c=>`<button type="button" class="cat ${active===c.id?'active':''}" onclick="filterCat(${c.id})"><i>${safe(c.icon||"📦")}</i><span>${safe(c.name)}</span></button>`).join("");
  const selected=categories.find(c=>Number(c.id)===Number(active));
  document.getElementById("productsHeading").textContent=selected?"منتجات: "+selected.name:"جميع المنتجات";
  const q=(search.value||"").toLowerCase();
  const arr=products.filter(p=>(!active||p.category_id===active)&&(!q||String(p.name||"").toLowerCase().includes(q)||String(p.description||"").toLowerCase().includes(q)));
  grid.innerHTML=arr.length?arr.map(p=>{
    const imgs=productImages(p), cover=imgs[0]||"";
    return `<article class="card" onclick="openProduct(${p.id})" style="cursor:pointer">
      ${cover?`<img src="${safe(cover)}" alt="${safe(p.name)}" style="cursor:pointer">`:`<div class="noimg">🛍️</div>`}
      <div class="cardbody"><small>${safe(p.categories?.name||"")}</small><h3>${safe(p.name||"منتج")}</h3>
      <div class="price">${Number(p.price||0).toLocaleString("ar-DZ")} دج</div>
      <button class="main-btn" style="width:100%;margin-bottom:8px" onclick="event.stopPropagation();openProduct(${p.id})">عرض التفاصيل</button>
      <button class="add" onclick="event.stopPropagation();add(${p.id})">أضف إلى السلة</button></div></article>`;
  }).join(""):"<p>لا توجد منتجات في هذا القسم حاليًا.</p>";
}
function openProduct(id){
  const p=products.find(x=>Number(x.id)===Number(id)); if(!p)return;
  const imgs=productImages(p), modal=document.getElementById("productDetailModal");
  document.getElementById("detailName").textContent=p.name||"اسم المنتج غير متوفر";
  document.getElementById("detailCategory").textContent=p.categories?.name||"";
  document.getElementById("detailPrice").textContent=Number(p.price||0).toLocaleString("ar-DZ")+" دج";
  document.getElementById("detailDescription").textContent=(p.description||"لا يوجد وصف مضاف لهذا المنتج حاليًا.");
  const main=document.getElementById("detailMainImage"), thumbs=document.getElementById("detailThumbs");
  main.src=imgs[0]||""; main.style.display=imgs.length?"block":"none";
  thumbs.innerHTML=imgs.map((url,i)=>`<img src="${safe(url)}" alt="صورة ${i+1}" onclick="document.getElementById('detailMainImage').src=this.src" style="width:68px;height:68px;object-fit:cover;border-radius:10px;cursor:pointer;border:1px solid #ddd">`).join("");
  document.getElementById("detailAddButton").onclick=()=>add(p.id);
  modal.style.display="block";
}
function closeProduct(){document.getElementById("productDetailModal").style.display="none"}
function filterCat(id){active=Number(id);render();document.getElementById("productsSection").scrollIntoView({behavior:"smooth",block:"start"})}
function showAllProducts(){active=null;render();document.getElementById("productsSection").scrollIntoView({behavior:"smooth",block:"start"})}
function add(id){const p=products.find(x=>Number(x.id)===Number(id));if(p){cart.push(p);drawCart();alert("تمت إضافة المنتج للسلة ✅")}}
function drawCart(){
  count.textContent=cart.length;
  items.innerHTML=cart.length?cart.map((p,i)=>`<div class="cartrow"><div class="row"><span>${safe(p.name)}</span><b>${Number(p.price).toLocaleString("ar-DZ")} دج</b><button type="button" class="danger" onclick="cart.splice(${i},1);drawCart()">حذف</button></div></div>`).join(""):"السلة فارغة";
  total.textContent=cart.reduce((s,p)=>s+Number(p.price||0),0).toLocaleString("ar-DZ")+" دج";
}
function openCart(){drawCart();cartModal.style.display="block"}
function closeM(){cartModal.style.display="none"}
async function order(e){
  e.preventDefault();
  if(!cart.length)return alert("السلة فارغة. أضف منتجًا أولًا.");
  const submit=e.submitter; if(submit){submit.disabled=true;submit.textContent="جارٍ تسجيل الطلب..."}
  try{
    const sum=cart.reduce((s,p)=>s+Number(p.price||0),0);
    const {data:o,error}=await db.from("orders").insert({
      customer_name:name.value.trim(),phone:phone.value.trim(),wilaya:wilaya.value,
      address:address.value.trim(),delivery_method:delivery.value,total:sum,status:"جديد"
    }).select().single();
    if(error)throw error;
    const rows=cart.map(p=>({order_id:o.id,product_id:p.id,product_name:p.name,price:Number(p.price),quantity:1}));
    const itemResult=await db.from("order_items").insert(rows);
    if(itemResult.error){
      alert("تم تسجيل الطلب رقم "+o.id+"، لكن تعذر حفظ تفاصيل المنتجات. أخبر المدير بهذا الرقم.");
    }else{
      alert("تم تسجيل طلبك بنجاح ✅\nرقم الطلب: "+o.id+"\nسيتم التواصل معك لتأكيده.");
    }
    cart=[];drawCart();document.getElementById("cartForm").reset();closeM();
  }catch(err){
    console.error(err);
    alert("تعذر تسجيل الطلب. تحقق من الاتصال أو إعدادات قاعدة البيانات ثم حاول مجددًا.");
  }finally{
    if(submit){submit.disabled=false;submit.textContent="تأكيد الطلب — الدفع عند الاستلام"}
  }
}
function safe(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
load();
