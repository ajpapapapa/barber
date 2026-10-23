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

// 2. 예약 날짜·시간 (달력 + 시간표, 서버의 예약 현황을 15초마다 다시 불러옴)
const POLL_MS = 15000;
let avail = null; // { today, days: [{ date, closed, slots: [{ time, available }] }] }
let viewMonth = ""; // 달력에 보이는 달 "YYYY-MM"
let selectedDate = "";
let selectedTime = "";
let loadSeq = 0;

const dayOf = (date) => avail && avail.days.find((d) => d.date === date);
const dateLabel = (date) => {
  const d = new Date(date + "T00:00");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`;
};

async function loadAvailability() {
  const seq = ++loadSeq;
  try {
    const res = await fetch("/api/availability?service=" + encodeURIComponent(selectedId));
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (seq !== loadSeq) return; // 더 최근 요청이 있으면 무시
    avail = data;
    if (!viewMonth) viewMonth = data.today.slice(0, 7);

    // 고른 시간이 그새 마감됐으면 선택 해제
    const slot = selectedTime && dayOf(selectedDate)?.slots.find((s) => s.time === selectedTime);
    if (selectedTime && !slot?.available) {
      selectedTime = "";
      $("err-pickup").textContent = "선택하신 시간이 방금 마감됐어요. 다른 시간을 골라주세요.";
      renderSummary();
    }

    const t = new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", second: "2-digit" });
    $("live-status").textContent = `실시간 예약 현황 · ${t} 기준`;
    $("live-status").className = "live on";
  } catch {
    if (seq !== loadSeq) return;
    $("live-status").textContent = "예약 현황을 불러오지 못했어요. 잠시 후 다시 시도합니다.";
    $("live-status").className = "live off";
  }
  renderCalendar();
  renderSlots();
}

function renderCalendar() {
  if (!avail) return;
  const [y, m] = viewMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lastDate = new Date(y, m, 0).getDate();
  $("cal-title").textContent = `${y}년 ${m}월`;

  let html = "<span></span>".repeat(first.getDay());
  for (let d = 1; d <= lastDate; d++) {
    const date = `${viewMonth}-${String(d).padStart(2, "0")}`;
    const day = dayOf(date);
    const open = day && !day.closed && day.slots.some((s) => s.available);
    const note = !day ? "" : day.closed ? "휴무" : open ? "" : "마감";
    const cls = ["cal-day", "w" + new Date(y, m - 1, d).getDay()];
    if (date === avail.today) cls.push("today");
    if (date === selectedDate) cls.push("selected");
    html += `<button type="button" class="${cls.join(" ")}" data-date="${date}" ${open ? "" : "disabled"}>
      ${d}<small>${note}</small></button>`;
  }
  $("cal-grid").innerHTML = html;

  const months = avail.days.map((d) => d.date.slice(0, 7));
  $("cal-prev").disabled = viewMonth <= months[0];
  $("cal-next").disabled = viewMonth >= months[months.length - 1];
}

function renderSlots() {
  const day = dayOf(selectedDate);
  if (!day) {
    $("slots-title").textContent = "날짜를 선택해 주세요.";
    $("slots").innerHTML = "";
    return;
  }
  $("slots-title").textContent = dateLabel(selectedDate) + (selectedId ? "" : " · 시술을 고르면 시술 시간에 맞춰 다시 보여드려요");

  const group = (label, slots) =>
    slots.length
      ? `<p class="slot-group">${label}</p><div class="slot-grid">${slots
          .map(
            (s) => `<button type="button" class="slot${s.time === selectedTime ? " selected" : ""}"
              data-time="${s.time}" ${s.available ? "" : "disabled"}>${s.time}</button>`
          )
          .join("")}</div>`
      : "";
  $("slots").innerHTML =
    group("오전", day.slots.filter((s) => s.time < "12:00")) + group("오후", day.slots.filter((s) => s.time >= "12:00"));
}

$("cal-grid").addEventListener("click", (e) => {
  const btn = e.target.closest(".cal-day");
  if (!btn || btn.disabled) return;
  selectedDate = btn.dataset.date;
  selectedTime = "";
  $("err-pickup").textContent = "";
  renderCalendar();
  renderSlots();
  renderSummary();
});

$("slots").addEventListener("click", (e) => {
  const btn = e.target.closest(".slot");
  if (!btn || btn.disabled) return;
  selectedTime = btn.dataset.time;
  $("err-pickup").textContent = "";
  renderSlots();
  renderSummary();
});

function moveMonth(diff) {
  const [y, m] = viewMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + diff, 1);
  viewMonth = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  renderCalendar();
}
$("cal-prev").addEventListener("click", () => moveMonth(-1));
$("cal-next").addEventListener("click", () => moveMonth(1));

// 시술마다 걸리는 시간이 달라서, 시술을 바꾸면 예약 가능 시간도 다시 불러옴
$("menu-list").addEventListener("change", loadAvailability);

setInterval(() => {
  if (!document.hidden) loadAvailability();
}, POLL_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadAvailability();
});
loadAvailability();

function pickupText() {
  if (!selectedDate || !selectedTime) return "";
  return `${dateLabel(selectedDate)} ${selectedTime}`;
}

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

// 5. 예약하기 (서버에 저장)
$("order-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const result = calc();
  const name = $("name").value.trim();
  const phone = $("phone").value.replace(/[^0-9]/g, "");
  let firstError = null;

  const check = (errId, message) => {
    $(errId).textContent = message;
    if (message && !firstError) firstError = $(errId);
  };

  check("err-items", result ? "" : "시술을 하나 골라주세요.");
  check("err-pickup", selectedDate && selectedTime ? "" : "예약 날짜와 시간을 선택해 주세요.");

  if (!name) check("err-info", "이름을 입력해 주세요.");
  else if (!/^01[0-9]{8,9}$/.test(phone)) check("err-info", "연락처를 정확히 입력해 주세요. (예: 010-1234-5678)");
  else check("err-info", "");

  const showError = (el) => el.closest(".step-box").scrollIntoView({ behavior: "smooth", block: "center" });
  if (firstError) return showError(firstError);

  const submitBtn = document.querySelector('button[form="order-form"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "예약 중…";

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: selectedId,
        date: selectedDate,
        time: selectedTime,
        name,
        phone,
        memo: $("memo").value.trim(),
        coupon: couponCode,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 시간이 마감됐거나 날짜 문제면 시간표를 새로 고침
      if (res.status === 409) {
        selectedTime = "";
        renderSummary();
      }
      await loadAvailability();
      $("err-pickup").textContent = data.message || "예약에 실패했어요. 잠시 후 다시 시도해 주세요.";
      return showError($("err-pickup"));
    }

    try {
      if (couponCode) localStorage.removeItem("n5d-coupon"); // 쿠폰은 한 번만 사용
    } catch {}

    $("done-no").textContent = data.bookingNo;
    $("done-list").innerHTML =
      itemRows(result) + `<li class="done-total"><span>결제 예정</span><b>${won(data.total)}</b></li>`;
    $("done-pickup").textContent = `📍 ${dateLabel(data.date)} ${data.time} 방문`;
    $("done").hidden = false;
  } catch {
    $("err-pickup").textContent = "인터넷 연결을 확인하고 다시 시도해 주세요.";
    showError($("err-pickup"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "예약하기";
  }
});
