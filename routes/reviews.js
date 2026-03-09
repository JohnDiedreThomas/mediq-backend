const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================
   SUBMIT REVIEW
===================== */
router.post("/", (req, res) => {
  console.log("🔥 Review request received:", req.body);

  const { doctor_id, user_id, rating, comment } = req.body;

  if (!doctor_id || !user_id || !rating) {
    return res.json({ success: false, message: "Missing fields" });
  }

  const sql = `
    INSERT INTO doctor_reviews (doctor_id, user_id, rating, comment)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      rating = VALUES(rating),
      comment = VALUES(comment)
  `;

  db.query(sql, [doctor_id, user_id, rating, comment || null], (err) => {
    if (err) {
      console.error(err);
      return res.json({ success: false });
    }

    res.json({ success: true });
  });
});

/* =====================
   GET REVIEWS BY DOCTOR
===================== */
router.get("/:doctorId", (req, res) => {
  const doctorId = parseInt(req.params.doctorId);

  const sql = `
    SELECT r.*, IFNULL(u.name, 'Patient') AS patient_name
    FROM doctor_reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.doctor_id = ?
    ORDER BY r.created_at DESC
  `;

  db.query(sql, [doctorId], (err, results) => {
    if (err) {
      console.error(err);
      return res.json({ success: false });
    }

    res.json({
      success: true,
      reviews: results,
    });
  });
});

/* =====================
   UPDATE REVIEW
===================== */
router.put("/:id", (req, res) => {

  const reviewId = parseInt(req.params.id);
  const { rating, comment } = req.body;

  if (!rating) {
    return res.json({ success:false, message:"Missing rating" });
  }

  const sql = `
    UPDATE doctor_reviews
    SET rating = ?, comment = ?
    WHERE id = ?
  `;

  db.query(sql, [rating, comment || null, reviewId], (err) => {

    if (err) {
      console.error(err);
      return res.json({ success:false });
    }

    res.json({ success:true });

  });

});

module.exports = router;