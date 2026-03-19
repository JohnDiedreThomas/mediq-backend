const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================
   SUBMIT REVIEW
===================== */
router.post("/", (req, res) => {
  console.log("🔥 Review request received:", req.body);

  const user_id = Number(req.headers["x-user-id"]); // ✅ GET FROM HEADER
  const { doctor_id, rating, comment } = req.body;

  if (!doctor_id || !user_id || !rating) {
    return res.json({ success: false, message: "Missing fields" });
  }
  if (
    !Number.isInteger(Number(doctor_id)) ||
    !Number.isInteger(Number(user_id)) ||
    !Number.isInteger(Number(rating)) ||
    rating < 1 || rating > 5
  ) {
    return res.json({ success:false, message:"Invalid input" });
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
  if (isNaN(doctorId)) {
    return res.json({ success:false, message:"Invalid doctor ID" });
  }
  const user_id = Number(req.headers["x-user-id"]);
  console.log("HEADER USER ID:", user_id);
  const sql = `
  SELECT 
  r.id,
  r.user_id,
  r.doctor_id,
  r.rating,
  r.comment,
  r.created_at,
  r.updated_at,
  IFNULL(u.name, 'Patient') AS patient_name,

  rc.comment AS admin_reply,
  au.name AS admin_name,

 COALESCE(SUM(CASE WHEN rv.vote = 'yes' THEN 1 ELSE 0 END),0) AS helpful_yes,
COALESCE(SUM(CASE WHEN rv.vote = 'no' THEN 1 ELSE 0 END),0) AS helpful_no,

  (SELECT vote FROM review_votes 
   WHERE review_id = r.id AND user_id = ?
   LIMIT 1) AS user_vote

FROM doctor_reviews r
LEFT JOIN users u ON r.user_id = u.id

-- ✅ ONLY ADMIN REPLIES
LEFT JOIN review_comments rc 
ON rc.review_id = r.id 
AND rc.user_id IN (
  SELECT id FROM users WHERE role = 'admin'
)
AND rc.id = (
  SELECT id FROM review_comments 
  WHERE review_id = r.id 
  AND user_id IN (SELECT id FROM users WHERE role = 'admin')
  ORDER BY created_at DESC 
  LIMIT 1
)

LEFT JOIN users au ON rc.user_id = au.id

WHERE r.doctor_id = ?
ORDER BY r.created_at DESC
  `;

  db.query(sql, [user_id || 0, doctorId], (err, results) => {
    if (err) {
      return res.json({ success: false, message: err.message });
    }
  
    res.json({
      success: true,
      reviews: results || [],
    });
  });

});

/* =====================
   UPDATE REVIEW
===================== */
router.put("/:id", (req, res) => {

  const reviewId = parseInt(req.params.id);
  const { rating, comment } = req.body;

  if (
    !Number.isInteger(Number(rating)) ||
    rating < 1 || rating > 5
  ) {
    return res.json({ success:false, message:"Invalid rating" });
  }
  const user_id = Number(req.headers["x-user-id"]);

  const sql = `
    UPDATE doctor_reviews
   SET rating = ?, comment = ?
    WHERE id = ? AND user_id = ?
  `;

  db.query(sql, [rating, comment || null, reviewId, user_id], (err, result) => {

    if (err) {
      console.error(err);
      return res.json({ success:false });
    }
  
    if (result.affectedRows === 0) {
      return res.json({
        success:false,
        message:"You can only edit your own review"
      });
    }

    res.json({ success:true });

  });

});


/* =====================
   DELETE REVIEW (SAFE)
===================== */
router.delete("/:id", (req, res) => {

  const reviewId = parseInt(req.params.id);
  if (isNaN(reviewId)) {
    return res.json({ success:false, message:"Invalid review ID" });
  }
  const user_id = Number(req.headers["x-user-id"]);

  if (!user_id) {
    return res.json({ success: false, message: "Missing user ID" });
  }

  // 🔥 STEP 1: delete comments first
  db.query(
    "DELETE FROM review_comments WHERE review_id = ?",
    [reviewId],
    (err) => {
  
      if (err) return res.json({ success:false });
  
      db.query(
        "DELETE FROM review_votes WHERE review_id = ?",
        [reviewId],
        (err) => {
  
          if (err) return res.json({ success:false });
  
          db.query(
            "DELETE FROM doctor_reviews WHERE id = ? AND user_id = ?",
            [reviewId, user_id],
            (err, result) => {
  
              if (err) return res.json({ success:false });
  
              if (result.affectedRows === 0) {
                return res.json({
                  success:false,
                  message:"You can only delete your own review"
                });
              }
  
              res.json({ success:true });
  
            }
          );
  
        }
      );
  
    }
  );

});

/* =====================
   VOTE REVIEW (YES/NO)
===================== */
router.post("/:id/vote", (req, res) => {

  const reviewId = parseInt(req.params.id);
  const user_id = Number(req.headers["x-user-id"]);
  const { type } = req.body;

  if (!reviewId || !user_id || !["yes","no"].includes(type)) {
    return res.json({ success:false, message:"Invalid input" });
  }

  const sql = `
    INSERT INTO review_votes (review_id, user_id, vote)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE vote = VALUES(vote)
  `;

  db.query(sql, [reviewId, user_id, type], (err) => {
    if (err) {
      console.error("VOTE ERROR:", err);
      return res.json({ success:false, message:"Database error" });
    }

    res.json({ success:true });
  });

});

/* =====================
   ADD COMMENT (REPLY)
===================== */
router.post("/:id/comments", (req, res) => {

  const reviewId = parseInt(req.params.id);
  const user_id = Number(req.headers["x-user-id"]);
  const { comment } = req.body;

  if (!reviewId || !user_id || !comment) {
    return res.json({ success:false, message:"Missing fields" });
  }

  const sql = `
    INSERT INTO review_comments (review_id, user_id, comment)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [reviewId, user_id, comment], (err) => {
    if (err) {
      console.error("COMMENT ERROR:", err);
      return res.json({ success:false });
    }

    res.json({ success:true });
  });

});

/* =====================
   GET COMMENTS
===================== */
router.get("/:id/comments", (req, res) => {

  const reviewId = parseInt(req.params.id);

  const sql = `
    SELECT rc.*, u.name, u.role
    FROM review_comments rc
    LEFT JOIN users u ON rc.user_id = u.id
    WHERE rc.review_id = ?
    ORDER BY rc.created_at ASC
  `;

  db.query(sql, [reviewId], (err, results) => {
    if (err) {
      console.error(err);
      return res.json({ success:false });
    }

    res.json({
      success:true,
      comments: results
    });
  });

});

/* =====================
   DELETE COMMENT
===================== */
router.delete("/comments/:id", (req, res) => {

  const commentId = parseInt(req.params.id);
  const user_id = Number(req.headers["x-user-id"]);

  const sql = `
    DELETE FROM review_comments
    WHERE id = ? AND user_id = ?
  `;

  db.query(sql, [commentId, user_id], (err, result) => {

    if (err) {
      console.error(err);
      return res.json({ success:false });
    }

    if (result.affectedRows === 0) {
      return res.json({
        success:false,
        message:"You can only delete your own comment"
      });
    }

    res.json({ success:true });

  });

});
module.exports = router;