const express = require("express");
const router = express.Router();
const db = require("../db");

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

router.post("/", (req, res) => {
  const { userId, latitude, longitude } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false });
  }

  db.query(
    "SELECT latitude, longitude FROM users WHERE id=?",
    [userId],
    (err, rows) => {

      if (rows.length > 0) {
        const prev = rows[0];

        if (prev.latitude && prev.longitude) {
          const d = getDistance(prev.latitude, prev.longitude, latitude, longitude);

          if (d < 8) {
            return res.json({ success: true });
          }
        }
      }

      db.query(
        "UPDATE users SET latitude=?, longitude=? WHERE id=?",
        [latitude, longitude, userId],
        () => {

          const dClinic = getDistance(
            CLINIC.latitude,
            CLINIC.longitude,
            latitude,
            longitude
          );

          if (dClinic <= CLINIC.radius) {
            db.query(
              `UPDATE appointments
               SET arrived = 1
               WHERE user_id = ?
               AND status = 'approved'
               AND DATE(date) = CURDATE()`,
              [userId]
            );
          } else {
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

    }
  );
});

router.get("/nearby", (req, res) => {
  db.query(
    `
   SELECT DISTINCT u.id, u.name, u.latitude, u.longitude
FROM users u
JOIN appointments a ON a.user_id = u.id
WHERE a.arrived = 1
AND a.status = 'approved'
AND DATE(a.date) = CURDATE()
    `,
    (err, rows) => {

      const inside = rows.filter(p => {
        if (!p.latitude) return false;

        const d = getDistance(
          CLINIC.latitude,
          CLINIC.longitude,
          p.latitude,
          p.longitude
        );

        return d <= CLINIC.radius;
      });

      res.json({ success: true, patients: inside });
    }
  );
});

module.exports = router;
