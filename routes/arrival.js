const express = require("express");
const router = express.Router();
const db = require("../db");
const auth = require("../middleware/auth");

router.post("/", auth, (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude } = req.body;

  db.query(
    "UPDATE users SET latitude=?, longitude=? WHERE id=?",
    [latitude, longitude, userId],
    (err) => {
      if (err) {
        console.error("LOCATION UPDATE ERROR:", err);
        return res.status(500).json({ success: false });
      }

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
});

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
