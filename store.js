// 예약 저장소
// - DATABASE_URL 환경변수가 있으면 PostgreSQL (배포용)
// - 없으면 data/bookings.json 파일 (내 컴퓨터에서 테스트용)
const fs = require("fs");
const path = require("path");

// ===== 파일 저장소 =====
function fileStore() {
  const FILE = path.join(__dirname, "data", "bookings.json");

  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
      return [];
    }
  };
  const write = (list) => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
  };
  const active = (b) => b.status !== "cancelled";

  return {
    kind: "file",
    async init() {},

    async listBetween(from, to) {
      return read().filter((b) => active(b) && b.date >= from && b.date <= to);
    },

    // 같은 날 예약을 읽고 → 비어 있으면 저장 (await 없이 한 번에 처리하므로 동시 예약이 끼어들 수 없음)
    async createIfFree(booking, isFree) {
      const list = read();
      if (!isFree(list.filter((b) => active(b) && b.date === booking.date))) return null;
      list.push(booking);
      write(list);
      return booking;
    },

    async cancel(bookingNo) {
      const list = read();
      const target = list.find((b) => b.bookingNo === bookingNo && active(b));
      if (!target) return false;
      target.status = "cancelled";
      write(list);
      return true;
    },
  };
}

// ===== PostgreSQL 저장소 =====
function pgStore(connectionString) {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString });

  const COLUMNS = `booking_no AS "bookingNo", service_id AS "serviceId", service_name AS "serviceName",
    date, time, minutes, name, phone, memo, coupon, total, status, created_at AS "createdAt"`;

  return {
    kind: "postgres",

    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bookings (
          booking_no   TEXT PRIMARY KEY,
          service_id   TEXT NOT NULL,
          service_name TEXT NOT NULL,
          date         TEXT NOT NULL,
          time         TEXT NOT NULL,
          minutes      INT  NOT NULL,
          name         TEXT NOT NULL,
          phone        TEXT NOT NULL,
          memo         TEXT NOT NULL DEFAULT '',
          coupon       TEXT NOT NULL DEFAULT '',
          total        INT  NOT NULL,
          status       TEXT NOT NULL DEFAULT 'booked',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings (date);
      `);
    },

    async listBetween(from, to) {
      const { rows } = await pool.query(
        `SELECT ${COLUMNS} FROM bookings WHERE status <> 'cancelled' AND date BETWEEN $1 AND $2`,
        [from, to]
      );
      return rows;
    },

    // 날짜별 잠금을 걸어서, 같은 날 동시에 들어온 예약은 한 건씩 차례로 확인
    async createIfFree(booking, isFree) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [booking.date]);
        const { rows } = await client.query(
          `SELECT ${COLUMNS} FROM bookings WHERE status <> 'cancelled' AND date = $1`,
          [booking.date]
        );
        if (!isFree(rows)) {
          await client.query("ROLLBACK");
          return null;
        }
        const b = booking;
        await client.query(
          `INSERT INTO bookings (booking_no, service_id, service_name, date, time, minutes, name, phone, memo, coupon, total, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [b.bookingNo, b.serviceId, b.serviceName, b.date, b.time, b.minutes, b.name, b.phone, b.memo, b.coupon, b.total, b.status]
        );
        await client.query("COMMIT");
        return booking;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },

    async cancel(bookingNo) {
      const { rowCount } = await pool.query(
        `UPDATE bookings SET status = 'cancelled' WHERE booking_no = $1 AND status <> 'cancelled'`,
        [bookingNo]
      );
      return rowCount > 0;
    },
  };
}

module.exports = process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : fileStore();
