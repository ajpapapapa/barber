// 사장님용 예약 관리 (오늘 이후 예약 목록 + 취소)
const $ = (id) => document.getElementById(id);
const won = (n) => n.toLocaleString() + "원";
const KEY = "n5d-admin";
let password = "";

try {
  password = sessionStorage.getItem(KEY) || "";
} catch {}

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const dateLabel = (date) => {
  const d = new Date(date + "T00:00");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`;
};

const phoneText = (p) => p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");

async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { "x-admin-password": password } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || "요청에 실패했어요."), { status: res.status });
  return data;
}

async function load() {
  try {
    const { today, bookings } = await api("/api/admin/bookings");
    $("login").hidden = true;
    $("board").hidden = false;
    try {
      sessionStorage.setItem(KEY, password);
    } catch {}
    render(today, bookings);
  } catch (err) {
    if (err.status === 401 || err.status === 503) {
      $("login").hidden = false;
      $("board").hidden = true;
      $("login-err").textContent = password ? err.message : "";
    } else {
      $("board-status").textContent = err.message;
    }
  }
}

function render(today, bookings) {
  const t = new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  $("board-status").textContent = `앞으로 예약 ${bookings.length}건 · ${t} 기준`;

  if (!bookings.length) {
    $("board-list").innerHTML = `<div class="step-box admin-empty">아직 들어온 예약이 없어요.</div>`;
    return;
  }

  const byDate = {};
  for (const b of bookings) (byDate[b.date] ||= []).push(b);

  $("board-list").innerHTML = Object.entries(byDate)
    .map(
      ([date, list]) => `
      <section class="step-box admin-day">
        <h2>${dateLabel(date)}${date === today ? ' <span class="admin-today">오늘</span>' : ""}<small>${list.length}건</small></h2>
        <ul>
          ${list
            .map(
              (b) => `
            <li class="admin-item">
              <b class="admin-time">${b.time}</b>
              <div class="admin-info">
                <p><b>${escape(b.name)}</b> · <a href="tel:${b.phone}">${phoneText(b.phone)}</a></p>
                <p class="admin-sub">${escape(b.serviceName)} · ${won(b.total)}${b.coupon ? " · 🎟 쿠폰" : ""} · ${b.bookingNo}</p>
                ${b.memo ? `<p class="admin-memo">${escape(b.memo)}</p>` : ""}
              </div>
              <button type="button" class="btn-outline" data-cancel="${b.bookingNo}">취소</button>
            </li>`
            )
            .join("")}
        </ul>
      </section>`
    )
    .join("");
}

$("login").addEventListener("submit", (e) => {
  e.preventDefault();
  password = $("password").value;
  load();
});

$("refresh").addEventListener("click", load);

$("board-list").addEventListener("click", async (e) => {
  const no = e.target.dataset.cancel;
  if (!no || !confirm(`예약 ${no}을(를) 취소할까요?\n취소하면 그 시간은 다시 예약할 수 있게 열립니다.`)) return;
  try {
    await api(`/api/admin/bookings/${no}/cancel`, { method: "POST" });
  } catch (err) {
    alert(err.message);
  }
  load();
});

// 1분마다 새 예약 확인
setInterval(() => {
  if (!document.hidden && !$("board").hidden) load();
}, 60000);

if (password) load();
