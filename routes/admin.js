const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

router.use(adminAuth); // 🔒 ADMIN ONLY

/*
|--------------------------------------------------------------------------
| ADMIN DASHBOARD
| GET /api/admin/dashboard
|--------------------------------------------------------------------------
| Shows real system overview (ALL records)
*/
router.get("/dashboard", (req, res) => {

  const sql = `
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'patient') AS patients,
      (SELECT COUNT(*) FROM users WHERE role = 'staff') AS staff,

      (SELECT COUNT(*) FROM appointments 
       WHERE DATE(date) = CURDATE()
      ) AS appointments_today,

      (SELECT COUNT(*) FROM appointments WHERE status = 'pending') AS pending,
      (SELECT COUNT(*) FROM appointments WHERE status = 'approved') AS approved,
      (SELECT COUNT(*) FROM appointments WHERE status = 'completed') AS completed,
      (SELECT COUNT(*) FROM appointments WHERE status = 'cancelled') AS cancelled
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("ADMIN DASHBOARD ERROR:", err);
      return res.status(500).json({ success: false });
    }

    res.json({
      success: true,
      stats: rows[0],
    });
  });
});
module.exports = router;
