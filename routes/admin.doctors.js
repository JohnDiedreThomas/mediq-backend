const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");
const upload = require("../middleware/uploadDoctorImage");

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
      id,
      name,
      specialty,
      description,
      is_active
    FROM doctors
    ORDER BY id DESC
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
        status: d.is_active === 1 ? "active" : "inactive",
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
  const { name, specialty, description} = req.body;

  if (!name || !specialty) {
    return res.json({
      success: false,
      message: "Missing fields",
    });
  }

  db.query(
    "INSERT INTO doctors (name, specialty, description, is_active) VALUES (?, ?, ?, 1)",
    [name, specialty],
    (err, result) => {
      if (err) {
        console.error("❌ ADD DOCTOR ERROR:", err);
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      res.json({ success: true });
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
  const { name, specialty, description } = req.body;

  if (!name || !specialty) {
    return res.json({
      success: false,
      message: "Missing fields",
    });
  }

  db.query(
    "UPDATE doctors SET name = ?, specialty = ?, description = ? WHERE id = ?",
    [name, specialty, description || null, req.params.id],
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

  const imagePath = `/uploads/doctors/${req.file.filename}`;

  db.query(
    "UPDATE doctors SET image=? WHERE id=?",
    [imagePath, id],
    (err) => {
      if (err) return res.status(500).json({ success: false });

      res.json({ success: true, image: imagePath });
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
    "SELECT COUNT(*) AS count FROM appointments WHERE doctor = ?",
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

module.exports = router;
