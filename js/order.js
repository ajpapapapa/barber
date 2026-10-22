// 시술 목록
const MENU = [
  { id: "cut", name: "커트", price: 20000, duration: "약 40분", img: "images/web/cut5.jpg" },
  { id: "cut-down", name: "커트 + 다운펌", price: 33000, duration: "약 70분", img: "images/web/cut2.jpg" },
  { id: "iron", name: "아이롱펌", price: 70000, duration: "약 120분 · 커트, 다운펌 포함", img: "images/web/cut4.jpg" },
];
const COUPON_PATTERN = /^N5D-[A-Z0-9]{4}$/;
const COUPON_RATE = 0.1; // 첫 방문 10% 할인

let selectedId = "";
let couponCode = "";

const won = (n) => n.toLocaleString() + "원";
const $ = (id) => document.getElementById(id);

// 1. 시술 목록 그리기 (하나만 고를 수 있게 라디오 버튼 사용)
$("menu-list").innerHTML = MENU.map(
  (m) => `
  <li>
    <label class="menu-item service">
      <input type="radio" name="service" value="${m.id}" />
      <div class="menu-thumb" style="background-image: url(${m.img})"></div>
      <div class="menu-info"><b>${m.name}</b><span>${m.duration}</span></div>
      <strong class="service-price">${won(m.price)}</strong>
    </label>
  </li>`
).join("");

$("menu-list").addEventListener("change", (e) => {
  selectedId = e.target.value;
  $("err-items").textContent = "";
  renderSummary();
});

// 메인에서 시술을 골라 들어온 경우 (order.html?service=cut)
const params = new URLSearchParams(location.search);
const preset = MENU.find((m) => m.id === params.get("service"));
if (preset) {
  selectedId = preset.id;
  document.querySelector(`input[value="${preset.id}"]`).checked = true;
}

// 2. 예약 날짜·시간 (내일부터 2주 안, 10:00 ~ 20:00)
function toDateValue(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const lastDay = new Date();
lastDay.setDate(lastDay.getDate() + 14);
$("pickup-date").min = toDateValue(tomorrow);
$("pickup-date").max = toDateValue(lastDay);

for (let h = 10; h <= 20; h++) {
  for (const m of ["00", "30"]) {
    if (h === 20 && m === "30") continue;
    const t = String(h).padStart(2, "0") + ":" + m;
    $("pickup-time").insertAdjacentHTML("beforeend", `<option value="${t}">${t}</option>`);
  }
}

function pickupText() {
  const date = $("pickup-date").value;
  const time = $("pickup-time").value;
  if (!date || !time) return "";
  const d = new Date(date + "T00:00");
  const day = "일월화수목금토"[d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${day}) ${time}`;
}

["pickup-date", "pickup-time"].forEach((id) =>
  $(id).addEventListener("change", () => {
    $("err-pickup").textContent = "";
    renderSummary();
  })
);

// 3. 쿠폰 (메인에서 받은 코드가 있으면 자동으로 채우기)
function applyCoupon() {
  const code = $("coupon-input").value.trim().toUpperCase();
  $("coupon-input").value = code;
  const msg = $("coupon-msg");

  if (COUPON_PATTERN.test(code)) {
    couponCode = code;
    msg.textContent = "✓ 첫 방문 10% 할인 쿠폰이 적용됐어요.";
    msg.className = "hint ok";
  } else {
    couponCode = "";
    msg.textContent = code ? "올바른 쿠폰 번호가 아니에요. (예: N5D-AB12)" : "첫 방문 쿠폰이 있다면 입력해 주세요.";
    msg.className = code ? "hint bad" : "hint";
  }
  renderSummary();
}

$("coupon-apply").addEventListener("click", applyCoupon);
$("coupon-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    applyCoupon();
  }
});

try {
  const saved = params.get("coupon") || localStorage.getItem("n5d-coupon");
  if (saved) {
    $("coupon-input").value = saved;
    applyCoupon();
  }
} catch {}

// 4. 예약 요약
function calc() {
  const service = MENU.find((m) => m.id === selectedId);
  if (!service) return null;
  const discount = couponCode ? Math.round((service.price * COUPON_RATE) / 100) * 100 : 0;
  return { service, discount, total: service.price - discount };
}

function itemRows({ service, discount }) {
  let rows = `<li><span>${service.name}</span><span>${won(service.price)}</span></li>`;
  if (discount) rows += `<li class="gift"><span>🎟 첫 방문 쿠폰 (10%)</span><span>−${won(discount)}</span></li>`;
  return rows;
}

function renderSummary() {
  const result = calc();
  $("summary-list").innerHTML = result ? itemRows(result) : `<li class="empty">아직 고른 시술이 없어요.</li>`;
  $("summary-pickup").textContent = pickupText() || "-";
  $("summary-total").textContent = won(result ? result.total : 0);
}

renderSummary();

// 5. 예약하기
$("order-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const result = calc();
  const name = $("name").value.trim();
  const phone = $("phone").value.replace(/[^0-9]/g, "");
  const date = $("pickup-date").value;
  let firstError = null;

  const check = (errId, message) => {
    $(errId).textContent = message;
    if (message && !firstError) firstError = $(errId);
  };

  check("err-items", result ? "" : "시술을 하나 골라주세요.");

  if (!date || !$("pickup-time").value) {
    check("err-pickup", "예약 날짜와 시간을 선택해 주세요.");
  } else if (date < $("pickup-date").min || date > $("pickup-date").max) {
    check("err-pickup", "예약은 내일부터 2주 이내로 선택할 수 있어요.");
  } else if (new Date(date + "T00:00").getDay() === 1) {
    check("err-pickup", "월요일은 휴무예요. 다른 날을 골라주세요.");
  } else {
    check("err-pickup", "");
  }

  if (!name) check("err-info", "이름을 입력해 주세요.");
  else if (!/^01[0-9]{8,9}$/.test(phone)) check("err-info", "연락처를 정확히 입력해 주세요. (예: 010-1234-5678)");
  else check("err-info", "");

  if (firstError) {
    firstError.closest(".step-box").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const bookingNo = "N" + Date.now().toString().slice(-6);
  const booking = {
    bookingNo,
    service: result.service.name,
    total: result.total,
    name,
    phone,
    datetime: pickupText(),
    memo: $("memo").value.trim(),
    coupon: couponCode,
  };

  // 서버가 없으므로 브라우저에 예약 내역을 저장해 둡니다
  try {
    const bookings = JSON.parse(localStorage.getItem("n5d-bookings") || "[]");
    bookings.push(booking);
    localStorage.setItem("n5d-bookings", JSON.stringify(bookings));
    if (couponCode) localStorage.removeItem("n5d-coupon"); // 쿠폰은 한 번만 사용
  } catch {}

  $("done-no").textContent = bookingNo;
  $("done-list").innerHTML =
    itemRows(result) + `<li class="done-total"><span>결제 예정</span><b>${won(result.total)}</b></li>`;
  $("done-pickup").textContent = `📍 ${booking.datetime} 방문`;
  $("done").hidden = false;
});
