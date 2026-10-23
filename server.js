const crypto = require("crypto");
const path = require("path");
const express = require("express");
const store = require("./store");

// ===== 영업 설정 =====
// 시술 목록 (가격은 js/order.js 화면용 목록과 같게 유지)
const MENU = {
  cut: { name: "커트", price: 20000, minutes: 40 },
  "cut-down": { name: "커트 + 다운펌", price: 33000, minutes: 70 },
  iron: { name: "아이롱펌", price: 70000, minutes: 120 },
};
const OPEN = toMin("10:00"); // 첫 예약
const LAST_START = toMin("20:00"); // 마지막 예약
const CLOSE = toMin("21:00"); // 영업 종료 (시술이 이 시간 안에 끝나야 함)
const STEP = 30; // 예약 칸 단위 (분)
const DAYS_AHEAD = 14; // 오늘부터 며칠 뒤까지 예약 가능
const LEAD = 60; // 당일 예약은 지금부터 60분 뒤 시간부터
const CLOSED_WEEKDAYS = [1]; // 월요일 휴무 (0 = 일요일)
const COUPON_PATTERN = /^N5D-[A-Z0-9]{4}$/;
const COUPON_RATE = 0.1;

// ===== 시간 계산 =====
function toMin(time) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function toTime(min) {
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
}

// 시술 시간을 30분 칸으로 올림 (40분 → 60분)
const blockMinutes = (minutes) => Math.ceil(minutes / STEP) * STEP;

// 배포 서버는 보통 UTC로 돌아가므로 한국 시간을 직접 계산
function nowKST() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function addDays(date, n) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const weekday = (date) => new Date(date + "T00:00:00Z").getUTCDay();

const ALL_TIMES = [];
for (let m = OPEN; m <= LAST_START; m += STEP) ALL_TIMES.push(toTime(m));

// 같은 날 예약들(dayBookings)과 겹치지 않고 영업시간 안에 끝나는지
function isFree(dayBookings, time, length) {
  const start = toMin(time);
  const end = start + length;
  if (end > CLOSE) return false;
  return dayBookings.every((b) => {
    const bStart = toMin(b.time);
    return end <= bStart || bStart + b.minutes <= start;
  });
}

// 날짜·시간이 예약 받을 수 있는 범위인지 (이미 지난 시간, 휴무일 등)
function isBookable(date, time, now) {
  if (date < now.date || date > addDays(now.date, DAYS_AHEAD)) return false;
  if (CLOSED_WEEKDAYS.includes(weekday(date))) return false;
  if (!ALL_TIMES.includes(time)) return false;
  if (date === now.date && toMin(time) < now.minutes + LEAD) return false;
  return true;
}

// ===== 서버 =====
const app = express();
app.use(express.json({ limit: "10kb" }));

// 화면 파일은 public/ 폴더만 공개 (Vercel에서는 public/을 Vercel이 직접 내보냄)
app.use(express.static(path.join(__dirname, "public")));

// 첫 API 요청 때 한 번만 저장소 준비 (테이블 만들기)
let ready = null;
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  ready ??= store.init().catch((err) => {
    ready = null; // 실패하면 다음 요청 때 다시 시도
    throw err;
  });
  ready.then(() => next(), next);
});

// 예약 가능 시간 (시술을 안 골랐으면 30분 기준)
app.get("/api/availability", async (req, res, next) => {
  try {
    const service = MENU[req.query.service];
    const length = blockMinutes(service ? service.minutes : STEP);
    const now = nowKST();
    const lastDate = addDays(now.date, DAYS_AHEAD);
    const booked = await store.listBetween(now.date, lastDate);

    const days = [];
    for (let i = 0; i <= DAYS_AHEAD; i++) {
      const date = addDays(now.date, i);
      const closed = CLOSED_WEEKDAYS.includes(weekday(date));
      const dayBookings = booked.filter((b) => b.date === date);
      const slots = closed
        ? []
        : ALL_TIMES.map((time) => ({
            time,
            available: isBookable(date, time, now) && isFree(dayBookings, time, length),
          }));
      days.push({ date, closed, slots });
    }
    res.json({ today: now.date, days });
  } catch (err) {
    next(err);
  }
});

// 예약하기
app.post("/api/bookings", async (req, res, next) => {
  try {
    const { service: serviceId, date, time, coupon = "" } = req.body || {};
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").replace(/[^0-9]/g, "");
    const memo = String(req.body?.memo || "").trim();
    const service = MENU[serviceId];
    const fail = (status, message) => res.status(status).json({ message });

    if (!service) return fail(400, "시술을 하나 골라주세요.");
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof time !== "string")
      return fail(400, "예약 날짜와 시간을 선택해 주세요.");
    if (!isBookable(date, time, nowKST())) return fail(400, "예약할 수 없는 날짜나 시간이에요. 다시 골라주세요.");
    if (!name || name.length > 30) return fail(400, "이름을 입력해 주세요.");
    if (!/^01[0-9]{8,9}$/.test(phone)) return fail(400, "연락처를 정확히 입력해 주세요. (예: 010-1234-5678)");
    if (memo.length > 500) return fail(400, "요청사항은 500자 이내로 적어주세요.");

    const couponCode = COUPON_PATTERN.test(String(coupon)) ? String(coupon) : "";
    const discount = couponCode ? Math.round((service.price * COUPON_RATE) / 100) * 100 : 0;
    const length = blockMinutes(service.minutes);

    const booking = await store.createIfFree(
      {
        bookingNo: "N" + crypto.randomBytes(3).toString("hex").toUpperCase(),
        serviceId,
        serviceName: service.name,
        date,
        time,
        minutes: length,
        name,
        phone,
        memo,
        coupon: couponCode,
        total: service.price - discount,
        status: "booked",
        createdAt: new Date().toISOString(),
      },
      (dayBookings) => isFree(dayBookings, time, length)
    );
    if (!booking) return fail(409, "방금 다른 손님이 그 시간을 예약했어요. 다른 시간을 골라주세요.");

    res.status(201).json({
      bookingNo: booking.bookingNo,
      serviceName: booking.serviceName,
      date: booking.date,
      time: booking.time,
      total: booking.total,
      discount,
    });
  } catch (err) {
    next(err);
  }
});

// ===== 관리자 (사장님용) =====
function requireAdmin(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return res.status(503).json({ message: "ADMIN_PASSWORD 환경변수를 설정해 주세요." });
  const hash = (s) => crypto.createHash("sha256").update(String(s)).digest();
  if (!crypto.timingSafeEqual(hash(req.get("x-admin-password") || ""), hash(password)))
    return res.status(401).json({ message: "비밀번호가 맞지 않아요." });
  next();
}

app.get("/api/admin/bookings", requireAdmin, async (req, res, next) => {
  try {
    const now = nowKST();
    const list = await store.listBetween(now.date, addDays(now.date, 365));
    list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    res.json({ today: now.date, bookings: list });
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/bookings/:no/cancel", requireAdmin, async (req, res, next) => {
  try {
    const ok = await store.cancel(req.params.no);
    if (!ok) return res.status(404).json({ message: "예약을 찾을 수 없어요." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요." });
});

// Vercel은 이 app을 가져가서 실행
module.exports = app;

// 내 컴퓨터에서 npm start로 실행할 때만 서버를 직접 켬
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`no.5dom 서버 실행 중 → http://localhost:${PORT} (저장소: ${store.kind})`));
}
