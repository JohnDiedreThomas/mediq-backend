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

      /* COMPLETION RATE */
const completionRate =
totalAppointments === 0
  ? 0
  : (completed / totalAppointments) * 100;

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
      GROUP BY d.id, d.name
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

    /* 6️⃣.1️⃣ BEST VISIT TIME (least busy hour) */
const [bestVisit] = await db.promise().query(
  `
  SELECT 
    HOUR(STR_TO_DATE(time,'%h:%i %p')) AS hour,
    COUNT(*) AS total
  FROM appointments
  WHERE date >= CURDATE() - INTERVAL ? DAY
  GROUP BY hour
  ORDER BY total ASC
  LIMIT 1
  `,
  [days]
  );
  
  const bestVisitHour =
  bestVisit.length && bestVisit[0].hour !== null
    ? new Date(0,0,0,bestVisit[0].hour).toLocaleTimeString([], {hour:'numeric', hour12:true})
    : null;
  
  
  /* 6️⃣.2️⃣ PEAK CROWD HOUR */
  const peakCrowdHour = peakHours.length
    ? new Date(0,0,0,peakHours[0].hour).toLocaleTimeString([], {hour:'numeric', hour12:true})
    : null;
  
  
  /* 6️⃣.3️⃣ AVERAGE WAIT TIME (estimated) */
  const avgWaitTime = days === 0
  ? 0
  : Math.round(totalAppointments / days);
  
  
  /* 6️⃣.4️⃣ AVERAGE PATIENTS INSIDE */
  const avgPatientsInside = days === 0 ? 0 : Math.round(totalAppointments / days);

    

    /* 7️⃣ MONTHLY TREND (FOR GRAPH) */
    const [monthlyTrend] = await db.promise().query(
      `
      SELECT 
        DATE_FORMAT(date, '%Y-%m') AS month_key,
        DATE_FORMAT(MIN(date), '%b %Y') AS month,
        COUNT(*) AS total
      FROM appointments
      WHERE date >= CURDATE() - INTERVAL ? DAY
      GROUP BY DATE_FORMAT(date, '%Y-%m')
      ORDER BY month_key ASC
      `,
      [days]
      );

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
          SELECT COALESCE(patient_gender,'Unknown') AS patient_gender, COUNT(*) AS total
          FROM appointments
          WHERE date >= CURDATE() - INTERVAL ? DAY
          GROUP BY patient_gender
          `,
          [days]
          );
/* 🔟 CONNECTION DISTRIBUTION */
const [connectionDistribution] = await db.promise().query(
  `
  SELECT COALESCE(connection_to_clinic,'Unknown') AS connection_to_clinic, COUNT(*) AS total
  FROM appointments
  WHERE date >= CURDATE() - INTERVAL ? DAY
  GROUP BY connection_to_clinic
  `,
  [days]
  );

/* 1️⃣1️⃣ MOST USED SERVICES */
const [serviceDistribution] = await db.promise().query(
  `
  SELECT COALESCE(s.name, 'Unknown Service') AS service, COUNT(a.id) AS total
  FROM appointments a
  LEFT JOIN services s ON s.id = a.service_id
  WHERE a.date >= CURDATE() - INTERVAL ? DAY
  GROUP BY s.name
  ORDER BY total DESC
  LIMIT 5
  `,
  [days]
  );

/* 1️⃣2️⃣ STAFF ACTIVITY */
const [staffActivity] = await db.promise().query(
  `
  SELECT u.name AS staff, COUNT(*) AS total
  FROM (
      SELECT approved_by AS staff_id FROM appointments WHERE approved_by IS NOT NULL
      UNION ALL
      SELECT arrived_by FROM appointments WHERE arrived_by IS NOT NULL
      UNION ALL
      SELECT completed_by FROM appointments WHERE completed_by IS NOT NULL
      UNION ALL
      SELECT cancelled_by FROM appointments WHERE cancelled_by IS NOT NULL
      UNION ALL
      SELECT no_show_by FROM appointments WHERE no_show_by IS NOT NULL
  ) actions
  JOIN users u ON u.id = actions.staff_id
  GROUP BY u.name
  ORDER BY total DESC
  LIMIT 5
  `
  );

/* 1️⃣3️⃣ STAFF ACTION BREAKDOWN */
const [staffActions] = await db.promise().query(
  `
  SELECT 
    u.name AS staff,
  
    SUM(CASE WHEN a.approved_by = u.id THEN 1 ELSE 0 END) AS approved,
    SUM(CASE WHEN a.arrived_by = u.id THEN 1 ELSE 0 END) AS arrived,
    SUM(CASE WHEN a.completed_by = u.id THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN a.cancelled_by = u.id THEN 1 ELSE 0 END) AS cancelled,
    SUM(CASE WHEN a.no_show_by = u.id THEN 1 ELSE 0 END) AS no_show
  
  FROM users u
  LEFT JOIN appointments a
  ON (
    a.approved_by = u.id
    OR a.arrived_by = u.id
    OR a.completed_by = u.id
    OR a.cancelled_by = u.id
    OR a.no_show_by = u.id
  )
  
  WHERE u.role = 'staff'
  
  GROUP BY u.id
  ORDER BY completed DESC
  LIMIT 5
  `
  );

    /* RESPONSE */
    res.json({
      success: true,
      data: {
        totalAppointments,
        statusCounts,
        noShowRate: Number(noShowRate.toFixed(1)),
        rescheduleRate: Number(rescheduleRate.toFixed(1)),
        completionRate: Number(completionRate.toFixed(1)),
        rescheduledCount,
        trend,
        doctorWorkload,
        peakHours,
        monthlyTrend,
        busiestMonth,
        genderDistribution,
        connectionDistribution,
        serviceDistribution,
        staffActivity,
        staffActions,
      
        bestVisitHour,
        peakCrowdHour,
        avgWaitTime,
        avgPatientsInside
      },
    });
  } catch (error) {
    console.error("ANALYTICS ERROR:", error);
    res.status(500).json({ success: false });
  }
});


module.exports = router;