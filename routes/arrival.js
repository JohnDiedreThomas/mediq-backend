const express = require("express");
const router = express.Router();
const db = require("../db");

/* ---------- Distance helper (meters) ---------- */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---------- POST arrival ---------- */
router.post("/", (req, res) => {
  console.log("ARRIVAL REQUEST BODY:", req.body);

  const { userId, latitude, longitude } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing userId",
    });
  }

  /* Check previous location */
  db.query(
    "SELECT latitude, longitude FROM users WHERE id=?",
    [userId],
    (err, rows) => {

      if (rows.length > 0) {
        const prev = rows[0];

        if (prev.latitude && prev.longitude) {
          const distance = getDistance(
            prev.latitude,
            prev.longitude,
            latitude,
            longitude
          );

          /* Ignore small GPS drift under 10m */
          if (distance < 10) {
            return res.json({ success: true });
          }
        }
      }

      /* Update user location */
      db.query(
        "UPDATE users SET latitude=?, longitude=? WHERE id=?",
        [latitude, longitude, userId],
        (err) => {
          if (err) {
            console.error("LOCATION UPDATE ERROR:", err);
            return res.status(500).json({ success: false });
          }

          /* Mark appointment as arrived */
          db.query(
            `
            UPDATE appointments
            SET arrived = 1
            WHERE user_id = ? AND DATE(date) = CURDATE()
            `,
            [userId],
            (err2) => {
              if (err2) {
                console.error("ARRIVAL UPDATE ERROR:", err2);
                return res.status(500).json({ success: false });
              }

              res.json({ success: true });
            }
          );
        }
      );

    }
  );
});

/* ---------- GET nearby ---------- */
router.get("/nearby", (req, res) => {
  db.query(
    `
    SELECT u.id, u.name, u.latitude, u.longitude
    FROM users u
    JOIN appointments a ON a.user_id = u.id
    WHERE a.arrived = 1
    `,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false });
      }

      res.json({ success: true, patients: rows });
    }
  );
});

module.exports = router;
