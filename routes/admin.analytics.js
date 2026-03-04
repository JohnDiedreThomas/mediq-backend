const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

router.use(adminAuth);

/*
|------------------------------------------------------------
| THESIS-LEVEL CLINIC ANALYTICS
|------------------------------------------------------------
| Returns:
| - Total Appointments
| - Status Counts (normalized)
| - No-Show Rate
| - Rescheduled Count
| - Daily Trends
| - Doctor Workload
| - Peak Hours
| - Monthly Trend (for graph)
| - Busiest Month
|------------------------------------------------------------
*/

router.get("/", async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;

    /* 1️⃣ TOTAL APPOINTMENTS */
    const [totalResult] = await db.promise().query(
      `
      SELECT COUNT(*) AS total
      FROM appointments
      WHERE date >= CURDATE() - INTERVAL ? DAY
      `,
      [days]
    );

    const totalAppointments = totalResult[0].total || 0;

    /* 2️⃣ STATUS COUNTS */
    const [rawStatusCounts] = await db.promise().query(
      `
      SELECT status, COUNT(*) AS total
      FROM appointments
      WHERE date >= CURDATE() - INTERVAL ? DAY
      GROUP BY status
      `,
      [days]
    );

    // Normalize statuses (so even 0 appears)
    const ALL_STATUSES = [
      "completed",
      "cancelled",
      "no_show",
      "approved",
      "pending",
    ];

    const statusCounts = ALL_STATUSES.map((status) => {
      const found = rawStatusCounts.find((s) => s.status === status);
      return {
        status,
        total: found ? found.total : 0,
      };
    });

    const completed =
      statusCounts.find((s) => s.status === "completed")?.total || 0;

    const noShow =
      statusCounts.find((s) => s.status === "no_show")?.total || 0;

    const noShowRate =
      totalAppointments === 0
        ? 0
        : (noShow / totalAppointments) * 100;

    /* 3️⃣ RESCHEDULE COUNT */
    const [rescheduleResult] = await db.promise().query(
      `
      SELECT COUNT(*) AS total
      FROM appointments
      WHERE rescheduled = 1
      AND date >= CURDATE() - INTERVAL ? DAY
      `,
      [days]
    );

    const rescheduledCount = rescheduleResult[0].total || 0;

    const rescheduleRate =
      totalAppointments === 0
        ? 0
        : (rescheduledCount / totalAppointments) * 100;

    /* 4️⃣ DAILY TREND */
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

    /* 5️⃣ DOCTOR WORKLOAD */
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

    /* 6️⃣ PEAK HOURS */
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

    /* 7️⃣ MONTHLY TREND (FOR GRAPH) */
    const [monthlyTrend] = await db.promise().query(`
      SELECT 
        DATE_FORMAT(date, '%Y-%m') AS month_key,
        DATE_FORMAT(MIN(date), '%b %Y') AS month,
        COUNT(*) AS total
      FROM appointments
      GROUP BY DATE_FORMAT(date, '%Y-%m')
      ORDER BY month_key ASC
    `);

    /* 8️⃣ BUSIEST MONTH */
    const busiestMonth =
      monthlyTrend.length > 0
        ? monthlyTrend.reduce((max, current) =>
            current.total > max.total ? current : max
          )
        : null;


        /* 9️⃣ GENDER DISTRIBUTION */
const [genderDistribution] = await db.promise().query(
  `
  SELECT patient_gender, COUNT(*) AS total
  FROM appointments
  WHERE date >= CURDATE() - INTERVAL ? DAY
  GROUP BY patient_gender
  `,
  [days]
);
/* 🔟 CONNECTION DISTRIBUTION */
const [connectionDistribution] = await db.promise().query(
  `
  SELECT connection_to_clinic, COUNT(*) AS total
  FROM appointments
  WHERE date >= CURDATE() - INTERVAL ? DAY
  GROUP BY connection_to_clinic
  `,
  [days]
);

    /* RESPONSE */
    res.json({
      success: true,
      data: {
        totalAppointments,
        statusCounts,
        noShowRate: Number(noShowRate.toFixed(1)),
        rescheduleRate: Number(rescheduleRate.toFixed(1)),
        rescheduledCount,
        trend,
        doctorWorkload,
        peakHours,
        monthlyTrend,
        busiestMonth,
        genderDistribution,
        connectionDistribution,
      },
    });
  } catch (error) {
    console.error("ANALYTICS ERROR:", error);
    res.status(500).json({ success: false });
  }
});


module.exports = router;