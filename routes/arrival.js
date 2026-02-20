const express = require("express");
const router = express.Router();
const db = require("../db");
const { sendPushNotification } = require("../pushNotification");

const CLINIC = {
  latitude: 13.236819,
  longitude: 123.776000,
  radius: 60,
};

const BUFFER = 5; // meters


function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ======================
   POST — UPDATE LOCATION
====================== */
router.post("/", (req, res) => {
  const { userId, latitude, longitude } = req.body;

  if (!userId || !latitude || !longitude) {
    return res.status(400).json({ success: false });
  }

  // ✅ Update heartbeat
  db.query(
    `UPDATE users
     SET latitude=?, longitude=?, last_location_update=NOW()
     WHERE id=?`,
    [latitude, longitude, userId],
    (err) => {

      if (err) {
        console.error("LOCATION UPDATE ERROR:", err);
        return res.status(500).json({ success: false });
      }

      const dClinic = getDistance(
        CLINIC.latitude,
        CLINIC.longitude,
        latitude,
        longitude
      );

      console.log(
        `[GPS] User ${userId} distance ${dClinic.toFixed(2)}m`
      );

      if (dClinic <= CLINIC.radius + BUFFER) {

        db.query(
          `UPDATE appointments
           SET arrived = 1, arrived_at = NOW()
           WHERE user_id = ?
           AND status = 'approved'
           AND DATE(date) = CURDATE()
           AND arrived = 0`,
          [userId],
          (err, result) => {

            if (!err && result.affectedRows > 0) {

              db.query(
                "SELECT id, push_token FROM users WHERE role='staff'",
                async (err, staffRows) => {

                  if (!err && staffRows) {

                    for (const staff of staffRows) {

                      db.query(
                        `INSERT INTO notifications (user_id, title, message)
                         VALUES (?, ?, ?)`,
                        [
                          staff.id,
                          "Patient Arrived",
                          "A patient has arrived at the clinic"
                        ]
                      );

                      if (staff.push_token) {
                        try {
                          await sendPushNotification(
                            staff.push_token,
                            "Patient Arrived 📍",
                            "A patient has arrived at the clinic"
                          );
                        } catch (e) {
                          console.log("Push send error:", e);
                        }
                      }
                    }

                  }

                }
              );

            }

          }
        );

      } else if (dClinic > CLINIC.radius + BUFFER) {

        db.query(
          `UPDATE appointments
           SET arrived = 0
           WHERE user_id = ?
           AND status = 'approved'
           AND DATE(date) = CURDATE()`,
          [userId]
        );

      }

      res.json({ success: true });
    }
  );
});

/* ======================
   GET — NEARBY PATIENTS
====================== */
router.get("/nearby", (req, res) => {

  // expire old appointments
  db.query(`
    UPDATE appointments
    SET arrived = 0,
        status = 'expired'
    WHERE DATE(date) < CURDATE()
    AND status = 'approved'
  `);

  db.query(
    `
    SELECT DISTINCT
      u.id,
      u.name,
      u.latitude,
      u.longitude,
      u.last_location_update
      a.arrived_at
    FROM users u
    JOIN appointments a ON a.user_id = u.id
    WHERE a.arrived = 1
    AND a.status = 'approved'
    AND DATE(a.date) = CURDATE()
    AND u.latitude IS NOT NULL
    AND u.longitude IS NOT NULL
    AND TIMESTAMPDIFF(SECOND, u.last_location_update, NOW()) <= 60
    `,
    (err, rows) => {

      if (err) {
        console.error("NEARBY ERROR:", err);
        return res.status(500).json({ success: false });
      }

      const inside = rows.filter(p => {
        

        const d = getDistance(
          CLINIC.latitude,
          CLINIC.longitude,
          p.latitude,
          p.longitude
        );

        return d <= CLINIC.radius + BUFFER;
      });

      res.json({ success: true, patients: inside });

    }
  );

});

module.exports = router;
