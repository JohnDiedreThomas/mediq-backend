const express = require("express");
const router = express.Router();
const db = require("../db");
const { sendPushNotification } = require("../pushNotification");

const CLINIC = {
  latitude: 13.236947,
  longitude: 123.775801,
  radius: 50,
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

  // ⭐ CHECK ACTIVE APPOINTMENT FIRST
  db.query(
    `SELECT status FROM appointments
     WHERE user_id = ?
     AND status IN ('approved','arrived')
     AND DATE(date) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
     LIMIT 1`,
    [userId],
    (err, rows) => {

      if (err) {
        console.error("STATUS CHECK ERROR:", err);
        return res.status(500).json({ success: false });
      }

      // ❌ Ignore GPS if appointment not active
      if (!rows.length || !["approved", "arrived"].includes(rows[0].status)) {
        return res.json({ success: true });
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
          console.log("📍 Distance:", dClinic);
          console.log("📍 Today PH:", new Date().toLocaleString());
          console.log(`[GPS] User ${userId} distance ${dClinic.toFixed(2)}m`);

          if (dClinic <= CLINIC.radius + BUFFER) {

            db.query(
              `UPDATE appointments
               SET arrived = 1,
                   arrived_at = NOW(),
                   arrival_stage = 'nearby'
               WHERE user_id = ?
               AND status IN ('approved','arrived')
               AND DATE(date) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
               AND arrived = 0`,
              [userId],
              (err, result) => {

                if (!err && result.affectedRows > 0) {

                  console.log(`🟡 User ${userId} entered clinic radius`);

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
                              "Patient Nearby",
                              "A patient is approaching the clinic"
                            ]
                          );

                          if (staff.push_token) {
                            try {
                              await sendPushNotification(
                                staff.push_token,
                                "Patient Nearby 📍",
                                "A patient is approaching the clinic"
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

            db.query(
              `UPDATE appointments
               SET arrived = 0
               WHERE user_id = ?
               AND status IN ('approved','arrived')
               AND DATE(date) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))`,
              [userId]
            );

          }

          // ⭐ REALTIME UPDATE
          const io = req.app.get("io");
          if (io) {
            io.emit("patientUpdate", {
              userId,
              latitude,
              longitude,
            });
          }

          res.json({ success: true });

        }
      );

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
    WHERE DATE(date) < DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
    AND status = 'approved'
  `);

  db.query(
    `
    SELECT DISTINCT
      u.id,
      u.name,
      u.latitude,
      u.longitude,
      u.last_location_update,
      a.arrived_at,
      a.arrival_stage
    FROM users u
    JOIN appointments a ON a.user_id = u.id
    WHERE a.arrived = 1
    AND a.status IN ('approved','arrived')
    AND DATE(a.date) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
    AND u.latitude IS NOT NULL
    AND u.longitude IS NOT NULL
    AND u.last_location_update > NOW() - INTERVAL 2 MINUTE
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

        const patients = inside.map(p => {

          const distance = getDistance(
            CLINIC.latitude,
            CLINIC.longitude,
            p.latitude,
            p.longitude
          );
        
          let waitingMinutes = null;
          if (p.arrived_at && !isNaN(new Date(p.arrived_at))) {
            const diff = Date.now() - new Date(p.arrived_at).getTime();
            waitingMinutes = Math.floor(diff / 60000);
          }
        
          const lastSeenSeconds = p.last_location_update
            ? Math.floor((Date.now() - new Date(p.last_location_update).getTime()) / 1000)
            : null;
        
          const gpsStatus = lastSeenSeconds <= 60 ? "Live" : "Stale";
        
          return {
            ...p,
            distance: Math.round(distance),
            waitingMinutes,
            lastSeenSeconds,
            gpsStatus
          };
        
        });
      
      res.json({ success: true, patients });

    }
  );

});

module.exports = router;
