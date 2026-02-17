const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

router.use(adminAuth);

/* =====================================================
   GET AVAILABILITY CALENDAR (ADMIN)
   GET /api/admin/schedule/:doctorId
===================================================== */
router.get("/:doctorId", (req, res) => {
  const { doctorId } = req.params;

  const sql = `
    SELECT 
      DATE(date) AS date,
      total_slots,
      booked_slots,
      is_closed
    FROM doctor_availability
    WHERE doctor_id = ?
  `;

  db.query(sql, [doctorId], (err, rows) => {
    if (err) {
      console.error("❌ ADMIN AVAILABILITY ERROR:", err);
      return res.status(500).json({ success: false });
    }

    const availability = {};
    rows.forEach(r => {
      availability[r.date] =
        r.is_closed === 1 || r.total_slots === 0
          ? "no_slots"
          : "available";
    });

    res.json({ success: true, availability });
  });
});

/* =====================================================
   GET TIME SLOTS (ADMIN)
   GET /api/admin/schedule/:doctorId/:date
===================================================== */
router.get("/:doctorId/:date", (req, res) => {
  const { doctorId, date } = req.params;

  const sql = `
    SELECT 
      id,
      time,
      total_slots,
      booked_slots
    FROM doctor_time_slots
    WHERE doctor_id = ?
      AND DATE(date) = ?
    ORDER BY time_value ASC
  `;

  db.query(sql, [doctorId, date], (err, rows) => {
    if (err) {
      console.error("❌ TIME SLOT ERROR:", err);
      return res.status(500).json({ success: false });
    }

    res.json({ success: true, slots: rows });
  });
});

/* =====================================================
   OPEN / CLOSE DATE
   PUT /api/admin/schedule/:doctorId/:date/status
===================================================== */
router.put("/:doctorId/:date/status", (req, res) => {
  const { doctorId, date } = req.params;
  const { is_closed } = req.body;

  const sql = `
    INSERT INTO doctor_availability (doctor_id, date, is_closed)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE is_closed = ?
  `;

  db.query(
    sql,
    [doctorId, date, is_closed ? 1 : 0, is_closed ? 1 : 0],
    err => {
      if (err) {
        console.error("❌ STATUS UPDATE ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({ success: true });
    }
  );
});

/* =====================================================
   UPDATE TOTAL SLOTS (PER DATE)
   PUT /api/admin/schedule/:doctorId/:date/slots
===================================================== */
router.put("/:doctorId/:date/slots", (req, res) => {
  const { doctorId, date } = req.params;
  const { total_slots } = req.body;

  const sql = `
    INSERT INTO doctor_availability (doctor_id, date, total_slots)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE total_slots = ?
  `;

  db.query(
    sql,
    [doctorId, date, total_slots, total_slots],
    err => {
      if (err) {
        console.error("❌ SLOT UPDATE ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({ success: true });
    }
  );
});

/* =====================================================
   ADD TIME SLOT
   POST /api/admin/schedule/:doctorId/:date/time
===================================================== */
router.post("/:doctorId/:date/time", (req, res) => {
  const { doctorId, date } = req.params;
  const { time, time_value, total_slots } = req.body;

  const sql = `
    INSERT INTO doctor_time_slots
    (doctor_id, date, time, time_value, total_slots, booked_slots)
    VALUES (?, ?, ?, ?, ?, 0)
  `;

  db.query(
    sql,
    [doctorId, date, time, time_value, total_slots],
    err => {
      if (err) {
        console.error("❌ ADD SLOT ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({ success: true });
    }
  );
});

/* =====================================================
   DELETE TIME SLOT (IF NO BOOKINGS)
   DELETE /api/admin/schedule/time/:slotId
===================================================== */
router.delete("/time/:slotId", (req, res) => {
  const { slotId } = req.params;

  db.query(
    "SELECT booked_slots FROM doctor_time_slots WHERE id = ?",
    [slotId],
    (err, rows) => {
      if (rows?.[0]?.booked_slots > 0) {
        return res.json({
          success: false,
          message: "Slot already booked",
        });
      }

      db.query(
        "DELETE FROM doctor_time_slots WHERE id = ?",
        [slotId],
        () => res.json({ success: true })
      );
    }
  );
});

module.exports = router;
