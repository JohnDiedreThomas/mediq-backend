const express = require("express");
const router = express.Router();
const db = require("../db");
const { sendPushNotification } = require("../pushNotification");

const CLINIC = {
  latitude: 13.236965,
  longitude: 123.775804,
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
          console.log("Distance to clinic:", dClinic);

          if (dClinic <= CLINIC.radius + BUFFER) {

            db.query(
              `UPDATE appointments
               SET arrived = 1,
                   status = 'arrived',
                   arrived_at = NOW(),
                   arrival_stage = 'nearby'
               WHERE user_id = ?
               AND status IN ('approved','arrived')
               AND DATE(date) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))`,
              [userId],
              (err, result) => {

                if (!err && result.affectedRows > 0) {

                  console.log(`🟡 User ${userId} entered clinic radius`);
                
                  // ⭐ GET PATIENT NAME FIRST
                  db.query(
                    "SELECT name FROM users WHERE id = ?",
                    [userId],
                    (err, userRows) => {
                
                      const patientName = userRows?.[0]?.name || "A patient";
                
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
                                  `${patientName} is approaching the clinic`
                                ]
                              );
                
                              if (staff.push_token) {
                                try {
                                  await sendPushNotification(
                                    staff.push_token,
                                    "Patient Nearby 📍",
                                    `${patientName} is approaching the clinic`
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
                  );
                
                }
              }
            );

          } else {

            db.query(
              `UPDATE appointments
              SET arrived = 0,
    arrived_at = NULL
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
      a.arrival_stage,
       a.status  
    FROM users u
    JOIN appointments a ON a.user_id = u.id
WHERE a.status IN ('approved','arrived')
    AND DATE(a.date) = DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))
    AND u.latitude IS NOT NULL
    AND u.longitude IS NOT NULL
    AND u.last_location_update IS NOT NULL
    `,
    (err, rows) => {

      if (err) {
        console.error("NEARBY ERROR:", err);
        return res.status(500).json({ success: false });
      }

     

      const patients = rows
  .map(p => {
    const distance = getDistance(
      CLINIC.latitude,
      CLINIC.longitude,
      p.latitude,
      p.longitude
    );

    let waitingMinutes = 0;

    if (p.arrived_at) {
      const arrivedTime = new Date(p.arrived_at);
      const now = Date.now();
      const diff = now - arrivedTime.getTime();

      if (diff < 0) {
        waitingMinutes = 0;
      } else {
        waitingMinutes = Math.floor(diff / 60000);
      }
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
  })
  .filter(p => p.distance <= CLINIC.radius + 15);
        
      
        const insideCount = patients.length;

        const longWait = patients.filter(p => (p.waitingMinutes ?? 0) > 10).length;
        
        const waits = patients
        .map(p => Number(p.waitingMinutes) || 0)
        .filter(w => w >= 0);
        
        const longestWait = waits.length ? Math.max(...waits) : 0;
        
        const averageWait = waits.length
          ? Math.round(waits.reduce((a,b)=>a+b,0) / waits.length)
          : 0;
        
        res.json({
          success: true,
          patients,
          stats: {
            inside: insideCount,
            longWait,
            longestWait,
            averageWait
          }
        });

    }
  );

});

module.exports = router;
