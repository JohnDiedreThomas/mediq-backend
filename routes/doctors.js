const express = require("express");
const router = express.Router();
const db = require("../db");


router.get("/with-ratings", (req, res) => {
  const sql = `
   SELECT d.id, d.name, d.specialty, d.image,
IFNULL(AVG(r.rating), 0) AS avg_rating,
COUNT(r.id) AS review_count
FROM doctors d
LEFT JOIN doctor_reviews r ON d.id = r.doctor_id
WHERE d.is_active = 1
GROUP BY d.id, d.name, d.specialty, d.image
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.json({ success: false });
    }

    res.json({
      success: true,
      doctors: results,
    });
  });
});

router.get("/by-service/:serviceId", (req, res) => {
  const { serviceId } = req.params;

  const sql = `
    SELECT d.id, d.name, d.specialty, d.image
    FROM doctors d
    JOIN services s ON s.category = d.specialty
    WHERE s.id = ?
      AND d.is_active = 1
  `;

  db.query(sql, [serviceId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false });
    }

    res.json({
      success: true,
      doctors: results,
    });
  });
});



/* =====================
   GET ALL DOCTORS
===================== */
router.get("/", (req, res) => {
  const sql =
    "SELECT id, name, specialty, image  FROM doctors WHERE is_active = 1";

  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json([]);
    }
    res.json({
      success: true,
      doctors: results,
    });
  });
});



/* =====================
   GET SINGLE DOCTOR (DETAIL PAGE)
===================== */
router.get("/:id", (req, res) => {
  const { id } = req.params;

  const sql =
    "SELECT id, name, specialty, description, image FROM doctors WHERE id = ?";

  db.query(sql, [id], (err, results) => {
    if (err || results.length === 0) {
      return res.json({ success: false });
    }

    res.json({
      success: true,
      doctor: results[0],
    });
  });
});




module.exports = router;