const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");
const upload = require("../middleware/uploadDoctorCloudinary");

router.use(adminAuth);

/*
|--------------------------------------------------
| GET ALL DOCTORS
| GET /api/admin/doctors
|--------------------------------------------------
*/
router.get("/", (req, res) => {
  db.query(
    `
    SELECT 
  d.id,
  d.name,
  d.specialty,
  d.description,
  d.image,
  d.is_active,
  s.name AS service_name,
  d.service_id
FROM doctors d
LEFT JOIN services s ON d.service_id = s.id
ORDER BY d.id DESC
    `,
    (err, rows) => {
      if (err) {
        console.error("❌ DOCTORS SQL ERROR:", err);
        return res.status(500).json({ success: false });
      }

      const doctors = rows.map((d) => ({
        id: d.id,
        name: d.name,
        specialty: d.specialty,
        description: d.description,
        image: d.image,
        status: d.is_active === 1 ? "active" : "inactive",
      
        // ✅ ADD THESE
        service_id: d.service_id,
        service_name: d.service_name,
      }));

      res.json({ success: true, doctors });
    }
  );
});

/*
|--------------------------------------------------
| ADD DOCTOR
| POST /api/admin/doctors
|--------------------------------------------------
*/
router.post("/", (req, res) => {
  let { name, specialty, description, service_id } = req.body;

name = name?.trim();
specialty = String(specialty || "").toLowerCase().trim();
if (!specialty) specialty = "general";
description = description?.trim() || null;

  if (!name || !specialty) {
    return res.json({
      success: false,
      message: "Missing fields",
    });
  }

  db.query(
    "INSERT INTO doctors (name, specialty, description, service_id, is_active) VALUES (?, ?, ?, ?, 1)",
    [name, specialty, description || null, service_id],
    (err, result) => {
      if (err) {
        console.error("❌ ADD DOCTOR ERROR:", err);
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }
  
      // ✅ RETURN ID
      res.json({
        success: true,
        id: result.insertId
      });
    }
  );
});

/*
|--------------------------------------------------
| UPDATE DOCTOR (EDIT)
| PUT /api/admin/doctors/:id
|--------------------------------------------------
*/
router.put("/:id", (req, res) => {
  console.log("BODY RECEIVED:", req.body); // 👈 ADD THIS
  let { name, specialty, description, service_id } = req.body;

name = name?.trim();
specialty = String(specialty || "").toLowerCase().trim();
if (!specialty) specialty = "general";
description = description?.trim() || null;

  if (!name || !specialty) {
    return res.json({
      success: false,
      message: "Missing fields",
    });
  }

  db.query(
    "UPDATE doctors SET name = ?, specialty = ?, description = ?, service_id = ? WHERE id = ?",
    [name, specialty, description || null, service_id, req.params.id],
    (err, result) => {
      if (err || result.affectedRows === 0) {
        console.error("❌ UPDATE DOCTOR ERROR:", err);
        return res.json({ success: false });
      }

      res.json({ success: true });
    }
  );
});

router.post("/:id/image", upload.single("image"), (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ success: false });
  }

  const imageUrl = req.file.path;

  db.query(
    "UPDATE doctors SET image=? WHERE id=?",
    [imageUrl, id],
    (err) => {
      if (err) return res.status(500).json({ success: false });

      res.json({ success: true, image: imageUrl });
    }
  );
});
/*
|--------------------------------------------------
| DELETE DOCTOR
| DELETE /api/admin/doctors/:id
|--------------------------------------------------
*/
router.delete("/:id", (req, res) => {
  const doctorId = req.params.id;

  db.query(
    "SELECT COUNT(*) AS count FROM appointments WHERE doctor_id = ?",
    [doctorId],
    (err, rows) => {
      if (err) {
        console.error("❌ APPOINTMENT CHECK ERROR:", err);
        return res.status(500).json({ success: false });
      }

      if (rows[0].count > 0) {
        return res.json({
          success: false,
          message: "Doctor has appointments and cannot be deleted",
        });
      }

      db.query(
        "DELETE FROM doctors WHERE id = ?",
        [doctorId],
        (err) => {
          if (err) {
            console.error("❌ DELETE DOCTOR ERROR:", err);
            return res.status(500).json({ success: false });
          }

          res.json({ success: true });
        }
      );
    }
  );
});

/*
|--------------------------------------------------
| TOGGLE DOCTOR STATUS
| PUT /api/admin/doctors/:id/status
|--------------------------------------------------
*/
router.put("/:id/status", (req, res) => {
  const { status } = req.body;

  const isActive = status === "active" ? 1 : 0;

  db.query(
    "UPDATE doctors SET is_active = ? WHERE id = ?",
    [isActive, req.params.id],
    (err, result) => {
      if (err || result.affectedRows === 0) {
        console.error("❌ STATUS UPDATE ERROR:", err);
        return res.json({ success: false });
      }

      res.json({ success: true });
    }
  );
});

/*
|--------------------------------------------------
| GET DOCTOR REVIEWS (ADMIN ANALYTICS)
| GET /api/admin/doctors/:id/reviews
|--------------------------------------------------
*/
router.get("/:id/reviews", (req, res) => {

  const doctorId = req.params.id;

  const sql = `
    SELECT 
      r.id,
      r.rating,
      r.comment,
      r.created_at,
      IFNULL(u.name, 'Patient') AS patient_name
    FROM doctor_reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.doctor_id = ?
    ORDER BY r.created_at DESC
  `;

  db.query(sql, [doctorId], (err, reviews) => {

    if (err) {
      console.error("❌ DOCTOR REVIEWS ERROR:", err);
      return res.status(500).json({ success:false });
    }

    /* ---------- CALCULATE ANALYTICS ---------- */

    const total = reviews.length;

    const average =
      total === 0
        ? 0
        : reviews.reduce((sum,r)=>sum + r.rating,0) / total;

    const distribution = {
      5: reviews.filter(r=>r.rating===5).length,
      4: reviews.filter(r=>r.rating===4).length,
      3: reviews.filter(r=>r.rating===3).length,
      2: reviews.filter(r=>r.rating===2).length,
      1: reviews.filter(r=>r.rating===1).length
    };

    res.json({
      success:true,
      total_reviews: total,
      average_rating: Number(average.toFixed(1)),
      distribution,
      reviews
    });

  });

});

module.exports = router;
