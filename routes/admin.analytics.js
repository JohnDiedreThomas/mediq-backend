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
      "arrived",
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

/* 🔥 RESCHEDULE BREAKDOWN (NEW) */
const [rescheduleBreakdown] = await db.promise().query(`
  SELECT 
    SUM(CASE WHEN rescheduled = 1 THEN 1 ELSE 0 END) AS total,
    SUM(CASE WHEN rescheduled_by IS NOT NULL THEN 1 ELSE 0 END) AS staff,
    SUM(CASE WHEN rescheduled = 1 AND rescheduled_by IS NULL THEN 1 ELSE 0 END) AS patient
  FROM appointments
  WHERE date >= CURDATE() - INTERVAL ? DAY
`, [days]);

const rescheduleStats = rescheduleBreakdown[0] || {
  total: 0,
  staff: 0,
  patient: 0
};

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

  /* 5️⃣.1️⃣ PEAK BOOKING HOURS (most scheduled times) */
  const [peakBookingHours] = await db.promise().query(`
    SELECT 
      HOUR(
        COALESCE(
          STR_TO_DATE(time,'%h:%i %p'),
          STR_TO_DATE(time,'%H:%i')
        )
      ) AS hour,
      COUNT(*) AS total
    FROM appointments
    WHERE time IS NOT NULL
    AND date >= CURDATE() - INTERVAL ? DAY
    AND (
      STR_TO_DATE(time,'%h:%i %p') IS NOT NULL
      OR STR_TO_DATE(time,'%H:%i') IS NOT NULL
    )
    GROUP BY hour
    ORDER BY total DESC
    LIMIT 5
  `, [days]);

    const formattedPeakBookingHours = peakBookingHours.map((row) => {
      if (row.hour === null) return null;
const hour = Number(row.hour);
      const displayHour = hour === 0
        ? "12 AM"
        : hour < 12
        ? `${hour} AM`
        : hour === 12
        ? "12 PM"
        : `${hour - 12} PM`;
    
      return {
        hour: displayHour,
        total: row.total
      };
    });
  

    /* 6️⃣ PEAK HOURS */
    const [peakHours] = await db.promise().query(
      `
     SELECT 
HOUR(arrived_at) AS hour,
COUNT(*) AS total
FROM appointments
WHERE status IN ('arrived', 'completed')
AND arrived_at IS NOT NULL
AND date >= CURDATE() - INTERVAL ? DAY
GROUP BY hour
ORDER BY total DESC
      `,
      [days]
    );

    /* 6️⃣.0️⃣ BEST APPOINTMENT TIME (least booked schedule hour) */
    const [bestAppointment] = await db.promise().query(`
      SELECT 
        HOUR(
          COALESCE(
            STR_TO_DATE(time,'%h:%i %p'),
            STR_TO_DATE(time,'%H:%i')
          )
        ) AS hour,
        COUNT(*) AS total
      FROM appointments
      WHERE time IS NOT NULL
      AND date >= CURDATE() - INTERVAL ? DAY
      AND (
        STR_TO_DATE(time,'%h:%i %p') IS NOT NULL
        OR STR_TO_DATE(time,'%H:%i') IS NOT NULL
      )
      GROUP BY hour
      ORDER BY total ASC, hour ASC
      LIMIT 1
    `, [days]);
  
  const bestAppointmentHour =
  bestAppointment.length && bestAppointment[0].hour !== null
  ? (() => {
    const hour = Number(bestAppointment[0].hour);
    return hour === 0
      ? "12 AM"
      : hour < 12
      ? `${hour} AM`
      : hour === 12
      ? "12 PM"
      : `${hour - 12} PM`;
  })()
    : null;

    /* 6️⃣.1️⃣ BEST VISIT TIME (least busy hour) */
const [bestVisit] = await db.promise().query(
  `
  SELECT 
HOUR(arrived_at) AS hour,
COUNT(*) AS total
FROM appointments
WHERE status IN ('arrived', 'completed')
AND arrived_at IS NOT NULL
AND date >= CURDATE() - INTERVAL ? DAY
GROUP BY hour
ORDER BY total ASC
LIMIT 1
  `,
  [days]
  );
  
  const bestVisitHour =
  bestVisit.length && bestVisit[0].hour !== null
  ? (() => {
    const hour = Number(bestVisit[0].hour);
    return hour === 0
      ? "12 AM"
      : hour < 12
      ? `${hour} AM`
      : hour === 12
      ? "12 PM"
      : `${hour - 12} PM`;
  })()
    : null;
  
  
  /* 6️⃣.2️⃣ PEAK CROWD HOUR */
  const peakCrowdHour = peakHours.length
    ? (() => {
      const hour = Number(peakHours[0].hour);
      return hour === 0
        ? "12 AM"
        : hour < 12
        ? `${hour} AM`
        : hour === 12
        ? "12 PM"
        : `${hour - 12} PM`;
    })()
    : null;
  
  
 /* 6️⃣.3️⃣ REAL AVERAGE WAIT TIME (FROM ARRIVAL SYSTEM) */
 const [waitResult] = await db.promise().query(`
  SELECT AVG(TIMESTAMPDIFF(MINUTE, arrived_at, NOW())) AS avgWait
  FROM appointments
  WHERE status = 'completed'
  AND arrived_at IS NOT NULL
  AND DATE(date) >= CURDATE() - INTERVAL ? DAY
`, [days]);
  
  const avgWaitTime = Math.round(waitResult[0].avgWait || 0);
  
  
  /* 6️⃣.4️⃣ REAL PATIENTS INSIDE (FROM ARRIVAL SYSTEM) */
  const [insideResult] = await db.promise().query(`
  SELECT COUNT(*) AS insideCount
  FROM appointments
WHERE status = 'arrived'
AND DATE(date) = CURDATE()
  `);
  
  const avgPatientsInside = insideResult[0].insideCount || 0;
    

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
    UNION ALL
    SELECT rescheduled_by FROM appointments WHERE rescheduled_by IS NOT NULL
) actions
JOIN users u ON u.id = actions.staff_id
GROUP BY u.name
ORDER BY total DESC
LIMIT 5
  `
  );

/* 1️⃣3️⃣ STAFF ACTION BREAKDOWN (FIXED TOTAL) */
const [staffActions] = await db.promise().query(`
  SELECT 
    u.name AS staff,
  
    (SELECT COUNT(*) FROM appointments WHERE approved_by = u.id) AS approved,
    (SELECT COUNT(*) FROM appointments WHERE arrived_by = u.id) AS arrived,
    (SELECT COUNT(*) FROM appointments WHERE completed_by = u.id) AS completed,
    (SELECT COUNT(*) FROM appointments WHERE cancelled_by = u.id) AS cancelled,
    (SELECT COUNT(*) FROM appointments WHERE no_show_by = u.id) AS no_show,
     (SELECT COUNT(*) FROM appointments WHERE rescheduled_by = u.id) AS rescheduled
  
  FROM users u
  WHERE u.role = 'staff'
  
  ORDER BY completed DESC
  LIMIT 5
  `);


/* 1️⃣4️⃣ DOCTOR REVIEW INSIGHTS */

/* MOST POSITIVELY REVIEWED DOCTOR */
const [mostReviewedDoctorResult] = await db.promise().query(`
  SELECT 
  d.id,
  d.name,
  d.specialty,
  COUNT(r.id) AS total_reviews,
  ROUND(AVG(r.rating),1) AS avg_rating
  FROM doctors d
  LEFT JOIN doctor_reviews r 
    ON r.doctor_id = d.id   -- ✅ FIXED (removed date filter)
  GROUP BY d.id, d.name, d.specialty
  HAVING total_reviews > 0
  ORDER BY avg_rating DESC, total_reviews DESC
  LIMIT 1
`);

const mostReviewedDoctor =
mostReviewedDoctorResult.length > 0
? mostReviewedDoctorResult[0]
: null;


/* MOST REVIEWED DOCTOR (POPULARITY) */
const [mostReviewCountDoctorResult] = await db.promise().query(`
  SELECT 
  d.id,
  d.name,
  d.specialty,
  COUNT(r.id) AS total_reviews,
  ROUND(AVG(r.rating),1) AS avg_rating
  FROM doctors d
  LEFT JOIN doctor_reviews r 
    ON r.doctor_id = d.id   -- ✅ FIXED
  GROUP BY d.id, d.name, d.specialty
  HAVING total_reviews > 0
  ORDER BY total_reviews DESC
  LIMIT 1
`);

const mostReviewCountDoctor =
  mostReviewCountDoctorResult.length > 0
    ? mostReviewCountDoctorResult[0]
    : null;


/* LEAST REVIEWED DOCTOR */
const [leastReviewCountDoctorResult] = await db.promise().query(`
  SELECT 
  d.id,
  d.name,
  d.specialty,
  COUNT(r.id) AS total_reviews,
  ROUND(AVG(r.rating),1) AS avg_rating
  FROM doctors d
  LEFT JOIN doctor_reviews r 
    ON r.doctor_id = d.id   -- ✅ FIXED
  GROUP BY d.id, d.name, d.specialty
  HAVING total_reviews > 0
  ORDER BY total_reviews ASC
  LIMIT 1
`);

const leastReviewCountDoctor =
  leastReviewCountDoctorResult.length > 0
    ? leastReviewCountDoctorResult[0]
    : null;


/* LOWEST RATED DOCTOR */
const [leastReviewedDoctorResult] = await db.promise().query(`
  SELECT 
  d.id,
  d.name,
  d.specialty,
  COUNT(r.id) AS total_reviews,
  ROUND(AVG(r.rating),1) AS avg_rating
  FROM doctors d
  LEFT JOIN doctor_reviews r 
    ON r.doctor_id = d.id   -- ✅ FIXED
  GROUP BY d.id, d.name, d.specialty
  HAVING total_reviews > 0
  ORDER BY avg_rating ASC, total_reviews DESC
  LIMIT 1
`);

const leastReviewedDoctor =
leastReviewedDoctorResult.length > 0
? leastReviewedDoctorResult[0]
: null;


/* 1️⃣5️⃣ TOP RATED DOCTORS */
const [topRatedDoctors] = await db.promise().query(`
  SELECT 
  d.id,
  d.name,
  d.specialty,
  COUNT(r.id) AS total_reviews,
  ROUND(AVG(r.rating),1) AS avg_rating
  FROM doctors d
  LEFT JOIN doctor_reviews r 
    ON r.doctor_id = d.id   -- ✅ FIXED
  GROUP BY d.id, d.name, d.specialty
  HAVING total_reviews > 0
  ORDER BY avg_rating DESC, total_reviews DESC
  LIMIT 5
`);


  /* 1️⃣6️⃣ STAFF PRODUCTIVITY RANKING */

const [staffProductivity] = await db.promise().query(`
  SELECT 
  u.id,
  u.name,
  
  (
    (SELECT COUNT(*) FROM appointments WHERE approved_by = u.id) +
    (SELECT COUNT(*) FROM appointments WHERE arrived_by = u.id) +
    (SELECT COUNT(*) FROM appointments WHERE completed_by = u.id) +
    (SELECT COUNT(*) FROM appointments WHERE cancelled_by = u.id) +
    (SELECT COUNT(*) FROM appointments WHERE no_show_by = u.id) +
    (SELECT COUNT(*) FROM appointments WHERE rescheduled_by = u.id)
  ) AS total_actions
  
  FROM users u
  WHERE u.role = 'staff'
  ORDER BY total_actions DESC
  LIMIT 5
  `);

  /* 1️⃣7️⃣ STAFF EFFICIENCY SCORE */

const [staffEfficiency] = await db.promise().query(`
  SELECT 
  u.id,
  u.name,
  
  (
   (SELECT COUNT(*) FROM appointments WHERE completed_by = u.id) * 3 +
   (SELECT COUNT(*) FROM appointments WHERE approved_by = u.id) * 2 +
   (SELECT COUNT(*) FROM appointments WHERE arrived_by = u.id) * 1 +
   (SELECT COUNT(*) FROM appointments WHERE rescheduled_by = u.id) * 1 -
   (SELECT COUNT(*) FROM appointments WHERE cancelled_by = u.id) * 1 -
   (SELECT COUNT(*) FROM appointments WHERE no_show_by = u.id) * 2
  ) AS efficiency_score
  
  FROM users u
  WHERE u.role='staff'
  ORDER BY efficiency_score DESC
  LIMIT 5
  `);

  /* 1️⃣8️⃣ MOST RELIABLE STAFF */

const [staffReliability] = await db.promise().query(`
  SELECT
  u.id,
  u.name,
  
  (SELECT COUNT(*) FROM appointments WHERE completed_by = u.id) AS completed,
  
  (
   (SELECT COUNT(*) FROM appointments WHERE completed_by = u.id) /
   NULLIF(
    (SELECT COUNT(*) FROM appointments WHERE completed_by = u.id) +
    (SELECT COUNT(*) FROM appointments WHERE cancelled_by = u.id) +
    (SELECT COUNT(*) FROM appointments WHERE no_show_by = u.id),
  0)
  ) * 100 AS reliability_rate
  
  FROM users u
  WHERE u.role='staff'
  ORDER BY reliability_rate DESC
  LIMIT 5
  `);

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
        peakBookingHours: formattedPeakBookingHours,
        peakHours: peakHours.map((row) => {
          const hour = Number(row.hour ?? 0);
          const displayHour = hour === 0
            ? "12 AM"
            : hour < 12
            ? `${hour} AM`
            : hour === 12
            ? "12 PM"
            : `${hour - 12} PM`;
        
          return {
            hour: displayHour,
            total: row.total
          };
        }),
        monthlyTrend,
        busiestMonth,
        genderDistribution,
        connectionDistribution,
        serviceDistribution,
        staffActivity,
        staffActions,

        staffProductivity,
        staffEfficiency,
        staffReliability,

        bestAppointmentHour,
        bestVisitHour,
        peakCrowdHour,
        avgWaitTime,
        avgPatientsInside,
        mostReviewedDoctor,
leastReviewedDoctor,
topRatedDoctors,
mostReviewCountDoctor,     
leastReviewCountDoctor,   
rescheduleStats, 
      },
    });
  } catch (error) {
    console.error("ANALYTICS ERROR:", error);
    res.status(500).json({ success: false });
  }
});


module.exports = router;