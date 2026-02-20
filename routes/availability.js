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
  DATE(a.date) AS date,
  CASE
    WHEN COUNT(s.id) = 0 THEN 'no_slots'
    WHEN SUM(s.total_slots - s.booked_slots) > 0 THEN 'available'
    ELSE 'no_slots'
  END AS status
FROM doctor_availability a
LEFT JOIN doctor_time_slots s
  ON s.doctor_id = a.doctor_id
  AND DATE(s.date) = DATE(a.date)
WHERE a.doctor_id = ?
AND DATE(a.date) >= CURDATE()
GROUP BY DATE(a.date);
  `;

  db.query(sql, [doctorId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json([]);
    }

    res.json(rows.map(r => ({
      date: new Date(r.date).toISOString().split("T")[0],
      status: r.status,
    })));
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
