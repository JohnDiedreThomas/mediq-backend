const express = require("express");
const router = express.Router();
const db = require("../db");

/* GET ACTIVE SERVICES (PATIENT) */
router.get("/", (req, res) => {
  db.query(
    "SELECT id, name, description, category FROM services WHERE status='active'",
    (err, rows) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true, services: rows });
    }
  );
});

module.exports = router;
