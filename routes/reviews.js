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
  const user_id = req.headers["x-user-id"]; // ✅ ADD THIS

  const sql = `
    SELECT 
      r.*, 
      IFNULL(u.name, 'Patient') AS patient_name,

      rc.comment AS admin_reply,
      au.name AS admin_name,

      (SELECT COUNT(*) FROM review_votes WHERE review_id = r.id AND vote='yes') AS helpful_yes,
      (SELECT COUNT(*) FROM review_votes WHERE review_id = r.id AND vote='no') AS helpful_no,

      (SELECT vote FROM review_votes 
       WHERE review_id = r.id AND user_id = ?
       LIMIT 1) AS user_vote

    FROM doctor_reviews r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN review_comments rc ON rc.review_id = r.id
    LEFT JOIN users au ON rc.user_id = au.id

    WHERE r.doctor_id = ?
    ORDER BY r.created_at DESC
  `;

  db.query(sql, [user_id, doctorId], (err, results) => { // ✅ FIXED
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


/* =====================
   DELETE REVIEW (SAFE)
===================== */
router.delete("/:id", (req, res) => {

  const reviewId = parseInt(req.params.id);
  const { user_id } = req.body;

  if (!user_id) {
    return res.json({ success: false, message: "Missing user ID" });
  }

  // 🔥 STEP 1: delete comments first
  db.query(
    "DELETE FROM review_comments WHERE review_id = ?",
    [reviewId],
    (err) => {
  
      if (err) {
        console.error(err);
        return res.json({ success: false });
      }
  
      // ✅ delete votes AFTER success
      db.query(
        "DELETE FROM review_votes WHERE review_id = ?",
        [reviewId],
        () => {}
      );

      // 🔥 STEP 2: delete review
      db.query(
        "DELETE FROM doctor_reviews WHERE id = ? AND user_id = ?",
        [reviewId, user_id],
        (err, result) => {

          if (err) {
            console.error(err);
            return res.json({ success: false });
          }

          if (result.affectedRows === 0) {
            return res.json({
              success: false,
              message: "You can only delete your own review"
            });
          }

          res.json({ success: true });

        }
      );

    }
  );

});


/* =====================
   ADD COMMENT TO REVIEW
===================== */
router.post("/:reviewId/comments", (req, res) => {

  const reviewId = parseInt(req.params.reviewId);
  const { comment } = req.body;
  const user_id = req.headers["x-user-id"];

  if (!comment || !user_id) {
    return res.json({ success: false, message: "Missing fields" });
  }

  // ✅ CHECK USER ROLE FIRST
  db.query(
    "SELECT role FROM users WHERE id = ?",
    [user_id],
    (err, userResult) => {

      if (err || userResult.length === 0) {
        return res.json({ success: false });
      }

      if (userResult[0].role !== "admin") {
        return res.json({
          success: false,
          message: "Only admin can reply"
        });
      }

      // ✅ CHECK IF ALREADY HAS REPLY
      db.query(
        "SELECT id FROM review_comments WHERE review_id = ? LIMIT 1",
        [reviewId],
        (err, existing) => {

          if (err) {
            return res.json({ success: false });
          }

          if (existing.length > 0) {
            return res.json({
              success: false,
              message: "Admin already replied"
            });
          }

          // ✅ INSERT ADMIN REPLY
          const sql = `
            INSERT INTO review_comments (review_id, user_id, comment)
            VALUES (?, ?, ?)
          `;

          db.query(sql, [reviewId, user_id, comment], (err) => {

            if (err) {
              console.error(err);
              return res.json({ success: false });
            }

            res.json({ success: true });

          });

        }
      );

    }
  );

});
/* =====================
   GET COMMENTS PER REVIEW
===================== */
router.get("/:reviewId/comments", (req, res) => {

  const reviewId = parseInt(req.params.reviewId);

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
      return res.json({ success: false });
    }

    res.json({
      success: true,
      comments: results
    });

  });

});

/* =====================
   DELETE COMMENT
===================== */
router.delete("/comments/:id", (req, res) => {

  const commentId = parseInt(req.params.id);
  const user_id = req.headers["x-user-id"];

  if (!user_id) {
    return res.json({ success: false, message: "Missing user ID" });
  }

  const sql = `
DELETE FROM review_comments
WHERE id = ? AND user_id = ?
`;

db.query(sql, [commentId, user_id], (err, result) => {

    if (err) {
      console.error(err);
      return res.json({ success: false });
    }

    if (result.affectedRows === 0) {
      return res.json({
        success: false,
        message: "You can only delete your own comment"
      });
    }

    res.json({ success: true });

  });

});

router.post("/:reviewId/vote", (req, res) => {

  const reviewId = parseInt(req.params.reviewId);
  const { type } = req.body;
  const user_id = req.headers["x-user-id"];

  if (!user_id || !type) {
    return res.json({ success:false });
  }
  
  if (!["yes","no"].includes(type)) {
    return res.json({
      success:false,
      message:"Invalid vote type"
    });
  }

  // ❌ prevent voting own review
  db.query(
    "SELECT user_id FROM doctor_reviews WHERE id = ?",
    [reviewId],
    (err, result) => {

      if (!result || result.length === 0) {
        return res.json({ success:false });
      }
      
      if (result[0].user_id == user_id) {
        return res.json({
          success:false,
          message:"You cannot vote your own review"
        });
      }

      // ✅ insert or update vote
      const sql = `
        INSERT INTO review_votes (review_id, user_id, vote)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE vote = VALUES(vote)
      `;

      db.query(sql, [reviewId, user_id, type], (err)=>{
        if(err) return res.json({ success:false });

        res.json({ success:true });
      });

    }
  );

});
module.exports = router;