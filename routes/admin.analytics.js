const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

router.use(adminAuth);

router.get("/", async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;

    /* ============================
       1️⃣ TOTAL APPOINTMENTS
    ============================ */
    const [totalResult] = await db.promise().query(
      `
      SELECT COUNT(*) AS total
      FROM appointments
      WHERE date >= CURDATE() - INTERVAL ? DAY
      `,
      [days]
    );

    const totalAppointments = totalResult[0].total;

    /* ============================
       2️⃣ STATUS COUNTS
    ============================ */
    const [statusCounts] = await db.promise().query(
      `
      SELECT status, COUNT(*) AS total
      FROM appointments
      WHERE date >= CURDATE() - INTERVAL ? DAY
      GROUP BY status
      `,
      [days]
    );

    let completed = 0;
    let noShow = 0;
    let cancelled = 0;
    let pending = 0;
    let approved = 0;

    statusCounts.forEach(s => {
      if (s.status === "completed") completed = s.total;
      if (s.status === "no_show") noShow = s.total;
      if (s.status === "cancelled") cancelled = s.total;
      if (s.status === "pending") pending = s.total;
      if (s.status === "approved") approved = s.total;
    });

    const noShowRate =
      totalAppointments === 0
        ? 0
        : (noShow / totalAppointments) * 100;

    const attendanceRate =
      completed + noShow === 0
        ? 0
        : (completed / (completed + noShow)) * 100;

    /* ============================
       3️⃣ RESCHEDULE (COUNT + RATE)
    ============================ */
    const [rescheduleResult] = await db.promise().query(
      `
      SELECT COUNT(*) AS total
      FROM appointments
      WHERE rescheduled = 1
      AND date >= CURDATE() - INTERVAL ? DAY
      `,
      [days]
    );

    const rescheduledCount = rescheduleResult[0].total;

    const rescheduleRate =
      totalAppointments === 0
        ? 0
        : (rescheduledCount / totalAppointments) * 100;

    /* ============================
       4️⃣ DAILY TREND
    ============================ */
    const [trend] = await db.promise().query(
      `
      SELECT DATE(date) AS day, COUNT(*) AS total
      FROM appointments
      WHERE date >= CURDATE() - INTERVAL ? DAY
      GROUP BY DATE(date)
      ORDER BY day ASC
      `,
      [days]
    );

    /* ============================
       5️⃣ DOCTOR WORKLOAD
    ============================ */
    const [doctorWorkload] = await db.promise().query(
      `
      SELECT d.name, COUNT(a.id) AS total
      FROM appointments a
      JOIN doctors d ON d.id = a.doctor
      WHERE a.date >= CURDATE() - INTERVAL ? DAY
      GROUP BY d.name
      ORDER BY total DESC
      `,
      [days]
    );

    /* ============================
       6️⃣ PEAK HOURS
    ============================ */
    const [peakHours] = await db.promise().query(
      `
      SELECT 
        HOUR(STR_TO_DATE(time, '%h:%i %p')) AS hour,
        COUNT(*) AS total
      FROM appointments
      WHERE date >= CURDATE() - INTERVAL ? DAY
      GROUP BY hour
      ORDER BY total DESC
      `,
      [days]
    );

    /* ============================
       7️⃣ BUSIEST MONTH
    ============================ */
    const [monthData] = await db.promise().query(
      `
      SELECT 
        DATE_FORMAT(date, '%M') AS month,
        COUNT(*) AS total
      FROM appointments
      WHERE date >= CURDATE() - INTERVAL ? DAY
      GROUP BY MONTH(date)
      ORDER BY total DESC
      LIMIT 1
      `,
      [days]
    );

    const busiestMonth =
      monthData.length > 0
        ? {
            month: monthData[0].month,
            total: monthData[0].total
          }
        : {
            month: "N/A",
            total: 0
          };

    /* ============================
       FINAL RESPONSE
    ============================ */
    res.json({
      success: true,
      data: {
        totalAppointments,
        statusCounts,
        noShowRate: Number(noShowRate.toFixed(1)),
        attendanceRate: Number(attendanceRate.toFixed(1)),
        rescheduleRate: Number(rescheduleRate.toFixed(1)),
        rescheduledCount,     // ✅ for Summary (COUNT)
        trend,
        doctorWorkload,
        peakHours,
        busiestMonth          // ✅ for Summary
      }
    });

  } catch (error) {
    console.error("ANALYTICS ERROR:", error);
    res.status(500).json({ success: false });
  }
});

module.exports = router;