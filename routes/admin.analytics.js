const express = require("express");
const router = express.Router();
const db = require("../db");
console.log("🔥 ADMIN ANALYTICS FILE EXECUTED");
/*
|--------------------------------------------------------------------------
| ADMIN ANALYTICS
|--------------------------------------------------------------------------
| Returns:
| - Appointment trend
| - Most used services
| - No-show rate
| - Doctor workload
| - Peak hours
| - Status distribution
|--------------------------------------------------------------------------
*/

router.get("/", async (req, res) => {
  try {
    const days = Number(req.query.days) || 7;

    // 1️⃣ Appointment Trend (Completed Only)
    const [trend] = await db.promise().query(
      `
      SELECT 
        DATE(date) AS day,
        COUNT(*) AS total
      FROM appointments
      WHERE status = 'completed'
        AND date >= CURDATE() - INTERVAL ? DAY
      GROUP BY DATE(date)
      ORDER BY day ASC
      `,
      [days]
    );

    // 2️⃣ Most Used Services (Completed Only)
    const [topServices] = await db.promise().query(
      `
      SELECT 
        s.name,
        COUNT(a.id) AS total
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      WHERE a.status = 'completed'
      GROUP BY s.name
      ORDER BY total DESC
      LIMIT 5
      `
    );

    // 3️⃣ No-Show Rate
    const [noShowData] = await db.promise().query(
      `
      SELECT
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count,
        SUM(CASE WHEN status IN ('completed','no_show') THEN 1 ELSE 0 END) AS attendance_total
      FROM appointments
      `
    );

    const noShowRate =
      noShowData[0].attendance_total === 0
        ? 0
        : (noShowData[0].no_show_count /
            noShowData[0].attendance_total) *
          100;

    // 4️⃣ Doctor Workload (Completed Only)
    const [doctorWorkload] = await db.promise().query(
      `
      SELECT 
        d.name,
        COUNT(a.id) AS total
      FROM appointments a
      JOIN doctors d ON d.id = a.doctor
      WHERE a.status = 'completed'
      GROUP BY d.name
      ORDER BY total DESC
      `
    );

    // 5️⃣ Peak Hours (Approved + Completed)
    const [peakHours] = await db.promise().query(
      `
      SELECT 
        HOUR(STR_TO_DATE(time, '%h:%i %p')) AS hour,
        COUNT(*) AS total
      FROM appointments
      WHERE status IN ('approved','completed')
      GROUP BY hour
      ORDER BY total DESC
      LIMIT 5
      `
    );

    // 6️⃣ Status Distribution
    const [statusDistribution] = await db.promise().query(
      `
      SELECT 
        status,
        COUNT(*) AS total
      FROM appointments
      GROUP BY status
      `
    );

    res.json({
      success: true,
      data: {
        trend,
        topServices,
        noShowRate: Number(noShowRate.toFixed(2)),
        doctorWorkload,
        peakHours,
        statusDistribution,
      },
    });
  } catch (error) {
    console.error("ADMIN ANALYTICS ERROR:", error);
    res.status(500).json({ success: false });
  }
});

module.exports = router;