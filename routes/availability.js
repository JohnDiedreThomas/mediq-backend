const express = require("express");
const router = express.Router();
const db = require("../db");

/*
|--------------------------------------------------------------------------
| GET doctor availability (for calendar)
| /api/doctors/:doctorId/availability
|--------------------------------------------------------------------------
*/
router.get("/:doctorId/availability", (req, res) => {
  const { doctorId } = req.params;

  const sql = `
  SELECT
    DATE(s.date) AS date,
    CASE
      WHEN SUM(s.total_slots - s.booked_slots) > 0 THEN 'available'
      ELSE 'no_slots'
    END AS status
  FROM doctor_time_slots s
  WHERE s.doctor_id = ?
  AND DATE(s.date) >= CURDATE()
  GROUP BY DATE(s.date)
`;

  db.query(sql, [doctorId], (err, rows) => {
    if (err) {
      console.error("AVAILABILITY ERROR:", err);
      return res.status(500).json([]);
    }

    const result = rows.map(r => ({
      date: new Date(r.date).toISOString().split("T")[0],
      status: r.status,
    }));

    res.json(result);
  });
});

/*
|--------------------------------------------------------------------------
| GET available time slots (per doctor + date)
| /api/doctors/:doctorId/availability/:date
|--------------------------------------------------------------------------
*/
router.get("/:doctorId/availability/:date", (req, res) => {
  const { doctorId, date } = req.params;
  const today = new Date();
  today.setHours(0,0,0,0);

const requestedDate = new Date(date);

if (requestedDate < today) {
  return res.json({
    success: false,
    slots: [],
  });
}
  

  const sql = `
    SELECT 
      time,
      total_slots,
      booked_slots,
      (total_slots - booked_slots) AS remaining
    FROM doctor_time_slots
    WHERE doctor_id = ?
      AND DATE(date) = ?
    ORDER BY time_value ASC
  `;

  db.query(sql, [doctorId, date], (err, rows) => {
    if (err) {
      console.error("TIME SLOT ERROR:", err);
      return res.json({ success: false, slots: [] });
    }

    res.json({
      success: true,
      slots: rows.map(r => ({
        time: r.time,
        remaining: Number(r.remaining),
        total: Number(r.total_slots),
      })),
    });
  });
});

module.exports = router;
