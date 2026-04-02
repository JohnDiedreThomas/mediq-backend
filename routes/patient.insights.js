const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {

    /* MOST USED SERVICE */
    const [service] = await db.promise().query(`
      SELECT s.name, s.image, COUNT(a.id) AS total
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id
      GROUP BY s.name
      ORDER BY total DESC
      LIMIT 1
    `);

    /* DOCTOR WITH MOST WORKLOAD */
    const [doctor] = await db.promise().query(`
      SELECT d.name, d.image, COUNT(a.id) AS total
      FROM appointments a
      JOIN doctors d ON d.id = a.doctor
      GROUP BY d.id
      ORDER BY total DESC
      LIMIT 1
    `);

    /* BEST APPOINTMENT TIME */
    const [bestAppointment] = await db.promise().query(`
      SELECT HOUR(time) AS hour, COUNT(*) AS total
      FROM appointments
      WHERE HOUR(time) BETWEEN 7 AND 23
      GROUP BY hour
      ORDER BY total ASC
      LIMIT 1
    `);

    /* BEST VISIT TIME */
    const [bestVisit] = await db.promise().query(`
      SELECT HOUR(arrived_at) AS hour, COUNT(*) AS total
      FROM appointments
      WHERE arrived_at IS NOT NULL
      AND HOUR(arrived_at) BETWEEN 7 AND 23
      GROUP BY hour
      ORDER BY total ASC
      LIMIT 1
    `);

    const formatHour = (h) =>
      h != null
        ? new Date(0, 0, 0, h).toLocaleTimeString([], {
            hour: "numeric",
            hour12: true,
          })
        : null;

    res.json({
      success: true,
      insights: {
        mostUsedService: service[0]
          ? {
              name: service[0].name,
              image: service[0].image,
            }
          : null,
      
        topDoctor: doctor[0]
          ? {
              name: doctor[0].name,
              image: doctor[0].image,
            }
          : null,
      
        bestAppointmentTime: formatHour(bestAppointment[0]?.hour),
        bestVisitTime: formatHour(bestVisit[0]?.hour),
      },
    });

  } catch (err) {
    console.log("PATIENT INSIGHTS ERROR:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;