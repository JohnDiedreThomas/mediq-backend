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

      // 🧠 INSIDE CLINIC
      if (dClinic <= CLINIC.radius) {

        // reset outside timer
        db.query(
          "UPDATE users SET outside_since = NULL WHERE id=?",
          [userId]
        );

        // ✅ ONLY affect TODAY approved appointments
        db.query(
          `UPDATE appointments
           SET arrived = 1
           WHERE user_id = ?
           AND status = 'approved'
           AND DATE(date) = CURDATE()`,
          [userId]
        );

      } else {

        // start outside timer if not already started
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

  db.query(
    `
    SELECT DISTINCT u.id, u.name, u.latitude, u.longitude, u.outside_since
    FROM users u
    JOIN appointments a ON a.user_id = u.id
    WHERE a.arrived = 1
    AND a.status = 'approved'
    AND DATE(a.date) = CURDATE()
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

        // ⏳ grace period logic (15s)
        if (p.outside_since) {
          const diff = (new Date() - new Date(p.outside_since)) / 1000;
          if (diff >= 15) return false;
        }

        return d <= CLINIC.radius;
      });

      res.json({ success: true, patients: inside });
    }
  );

});

module.exports = router;
