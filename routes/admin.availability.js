const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

router.use(adminAuth);

/*
|--------------------------------------------------------------------------
| GET availability dates for doctor (admin calendar)
| GET /api/admin/availability/:doctorId
|--------------------------------------------------------------------------
*/
router.get("/:doctorId", (req, res) => {
    const { doctorId } = req.params;
  
    const sql = `
    SELECT
      DATE(a.date) AS date,
      CASE
        WHEN MAX(a.is_closed) = 1 THEN 'closed'
        WHEN SUM(
          CASE
            WHEN s.booked_slots < s.total_slots THEN 1
            ELSE 0
          END
        ) > 0 THEN 'available'
        ELSE 'no_slots'
      END AS status
    FROM doctor_availability a
    LEFT JOIN doctor_time_slots s
      ON s.doctor_id = a.doctor_id
      AND DATE(s.date) = DATE(a.date)
    WHERE a.doctor_id = ?
    GROUP BY DATE(a.date)
  `;
  
    db.query(sql, [doctorId], (err, rows) => {
      if (err) {
        console.error("ADMIN AVAILABILITY ERROR:", err);
        return res.json({ success: false, availability: {} });
      }
  
      const availability = {};
      rows.forEach(r => {
        availability[r.date.toISOString().split("T")[0]] = r.status;
      });
  
      res.json({
        success: true,
        availability,
      });
    });
  });
/*
|--------------------------------------------------------------------------
| ADD availability date
| POST /api/admin/availability/:doctorId/date
|--------------------------------------------------------------------------
*/
router.post("/:doctorId/date", (req, res) => {
  const { doctorId } = req.params;
  const { date } = req.body;

  if (!date) {
    return res.json({ success: false, message: "Date required" });
  }

  db.query(
    "INSERT IGNORE INTO doctor_availability (doctor_id, date) VALUES (?, ?)",
    [doctorId, date],
    (err) => {
      if (err) {
        console.error("ADD DATE ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({ success: true });
    }
  );
});

/*
|--------------------------------------------------------------------------
| DELETE availability date (only if no slots booked)
| DELETE /api/admin/availability/:doctorId/date
|--------------------------------------------------------------------------
*/
router.delete("/:doctorId/date", (req, res) => {
  const { doctorId } = req.params;
  const { date } = req.body;

  db.query(
    "SELECT COUNT(*) AS total FROM doctor_time_slots WHERE doctor_id = ? AND DATE(date) = ? AND booked_slots > 0",
    [doctorId, date],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false });

      if (rows[0].total > 0) {
        return res.json({
          success: false,
          message: "Cannot remove date with booked appointments",
        });
      }

      db.query(
        "DELETE FROM doctor_time_slots WHERE doctor_id = ? AND DATE(date) = ?",
        [doctorId, date],
        () => {
          db.query(
            "DELETE FROM doctor_availability WHERE doctor_id = ? AND DATE(date) = ?",
            [doctorId, date],
            () => res.json({ success: true })
          );
        }
      );
    }
  );
});

/*
|--------------------------------------------------------------------------
| GET slots for date (admin)
| GET /api/admin/availability/:doctorId/:date
|--------------------------------------------------------------------------
*/
router.get("/:doctorId/:date", (req, res) => {
  const { doctorId, date } = req.params;

  db.query(
    `
    SELECT id, time, total_slots, booked_slots,
    (total_slots - booked_slots) AS remaining
    FROM doctor_time_slots
    WHERE doctor_id = ? AND DATE(date) = ?
    ORDER BY time_value ASC
    `,
    [doctorId, date],
    (err, rows) => {
      if (err) {
        console.error("ADMIN SLOT ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({ success: true, slots: rows });
    }
  );
});

/*
|--------------------------------------------------------------------------
| ADD time slot
| POST /api/admin/availability/:doctorId/:date/slot
|--------------------------------------------------------------------------
*/
router.post("/:doctorId/:date/slot", (req, res) => {
  const { doctorId, date } = req.params;
  const { time, time_value, total_slots } = req.body;

  if (!time || !time_value || !total_slots) {
    return res.json({ success: false, message: "Missing fields" });
  }

  // 1️⃣ Check if slot already exists
  const checkSql = `
    SELECT id, total_slots 
    FROM doctor_time_slots
    WHERE doctor_id = ?
      AND DATE(date) = ?
      AND time_value = ?
  `;

  db.query(checkSql, [doctorId, date, time_value], (err, rows) => {
    if (err) {
      console.error("CHECK SLOT ERROR:", err);
      return res.status(500).json({ success: false });
    }

    if (rows.length > 0) {
      // 2️⃣ Slot exists → UPDATE total_slots
      const updateSql = `
        UPDATE doctor_time_slots
        SET total_slots = total_slots + ?
        WHERE id = ?
      `;

      db.query(updateSql, [Number(total_slots), rows[0].id], (err2) => {
        if (err2) {
          console.error("UPDATE SLOT ERROR:", err2);
          return res.status(500).json({ success: false });
        }

        return res.json({
          success: true,
          message: "Slot already exists — capacity updated instead.",
        });
      });

    } else {
      // 3️⃣ Slot does not exist → INSERT new
      const insertSql = `
        INSERT INTO doctor_time_slots
        (doctor_id, date, time, time_value, total_slots, booked_slots)
        VALUES (?, ?, ?, ?, ?, 0)
      `;

      db.query(
        insertSql,
        [doctorId, date, time, time_value, Number(total_slots)],
        (err3) => {
          if (err3) {
            console.error("ADD SLOT ERROR:", err3);
            return res.status(500).json({ success: false });
          }

          return res.json({
            success: true,
            message: "New slot added",
          });
        }
      );
    }
  });
});

/*
|--------------------------------------------------------------------------
| UPDATE slot capacity
| PUT /api/admin/availability/slot/:slotId
|--------------------------------------------------------------------------
*/
router.put("/slot/:slotId", (req, res) => {
  const { slotId } = req.params;
  const { total_slots } = req.body;

  db.query(
    `
    UPDATE doctor_time_slots
    SET total_slots = ?
    WHERE id = ? AND total_slots >= booked_slots
    `,
    [total_slots, slotId],
    (err, result) => {
      if (err || result.affectedRows === 0) {
        return res.json({
          success: false,
          message: "Cannot reduce below booked slots",
        });
      }

      res.json({ success: true });
    }
  );
});

/*
|--------------------------------------------------------------------------
| DELETE slot (only if no bookings)
| DELETE /api/admin/availability/slot/:slotId
|--------------------------------------------------------------------------
*/
router.delete("/slot/:slotId", (req, res) => {
  const { slotId } = req.params;

  db.query(
    "SELECT booked_slots FROM doctor_time_slots WHERE id = ?",
    [slotId],
    (err, rows) => {
      if (err || rows.length === 0)
        return res.json({ success: false });

      if (rows[0].booked_slots > 0) {
        return res.json({
          success: false,
          message: "Slot has bookings",
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
