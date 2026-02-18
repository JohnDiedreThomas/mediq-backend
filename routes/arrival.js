const express = require("express");
const router = express.Router();
const db = require("../db");
const { sendPushNotification } = require("../pushNotification");

const CLINIC = {
  latitude: 13.236819,
  longitude: 123.776000,
  radius: 50,
};

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

  db.query(
    "UPDATE users SET latitude=?, longitude=? WHERE id=?",
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

      if (dClinic <= CLINIC.radius) {

        // mark online
        db.query(
          "UPDATE users SET outside_since = NULL WHERE id=?",
          [userId]
        );

        db.query(
          `UPDATE appointments
           SET arrived = 1
           WHERE user_id = ?
           AND status = 'approved'
           AND DATE(date) = CURDATE()
           AND arrived = 0`,
          [userId],
          (err, result) => {

            // notify only once
            if (!err && result.affectedRows > 0) {

              db.query(
                "SELECT id, push_token FROM users WHERE role='staff'",
                async (err, staffRows) => {
            
                  if (!err && staffRows) {
            
                    for (const staff of staffRows) {
            
                      // save notification in DB
                      db.query(
                        `INSERT INTO notifications (user_id, title, message)
                         VALUES (?, ?, ?)`,
                        [
                          staff.id,
                          "Patient Arrived",
                          "A patient has arrived at the clinic"
                        ]
                      );
            
                      // send push notification
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

      } else {

        // mark offline timer
        db.query(
          `UPDATE users
           SET outside_since = IFNULL(outside_since, NOW())
           WHERE id=?`,
          [userId]
        );

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

  db.query(`
    UPDATE appointments
    SET arrived = 0,
        status = 'expired'
    WHERE DATE(date) < CURDATE()
    AND status = 'approved'
  `);

  db.query(
    `
    SELECT DISTINCT u.id, u.name, u.latitude, u.longitude, u.outside_since
    FROM users u
    JOIN appointments a ON a.user_id = u.id
    WHERE a.arrived = 1
    AND a.status = 'approved'
    AND DATE(a.date) = CURDATE()
    AND u.latitude IS NOT NULL
AND u.longitude IS NOT NULL
    `,
    (err, rows) => {

      if (err) {
        console.error("NEARBY ERROR:", err);
        return res.status(500).json({ success: false });
      }

      const inside = rows.filter(p => {

        if (!p.latitude || !p.longitude) return false;

        const d = getDistance(
          CLINIC.latitude,
          CLINIC.longitude,
          p.latitude,
          p.longitude
        );

      
        
  // 🔴 REMOVE if last update > 60 seconds
  if (p.outside_since) {
    const diff = (Date.now() - new Date(p.outside_since).getTime()) / 1000;
    if (diff >= 60) return false;
  }

        return d <= CLINIC.radius;
      });

      res.json({ success: true, patients: inside });
    }
  );

});

module.exports = router;