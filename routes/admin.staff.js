const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const adminAuth = require("../middleware/adminAuth");
const upload = require("../middleware/uploadDoctorCloudinary");

router.use(adminAuth);

/*
|--------------------------------------------------
| GET ALL STAFF
| GET /api/admin/staff
|--------------------------------------------------
*/
router.get("/", (req, res) => {
  db.query(
    "SELECT id, name, email, status, image FROM users WHERE role = 'staff' ORDER BY id DESC",
    (err, rows) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true, staff: rows });
    }
  );
});

/*
|--------------------------------------------------
| ADD STAFF
| POST /api/admin/staff
|--------------------------------------------------
*/
router.post("/", upload.single("image"), (req, res) => {
  const imageUrl = req.file ? req.file.path : null;
    const { name, email, password } = req.body;
  
    if (!name || !email || !password) {
      return res.json({ success: false, message: "Missing fields" });
    }
  
    bcrypt.hash(password, 10, (err, hashed) => {
      if (err) return res.status(500).json({ success: false });
  
      db.query(
        "INSERT INTO users (name, email, password, role, status, image) VALUES (?, ?, ?, 'staff', 'active', ?)",
        [name, email.toLowerCase(), hashed, imageUrl],
        (err) => {
          if (err) {
            console.error("ADD STAFF ERROR:", err);
            return res.json({ success: false, message: "Email exists" });
          }
  
          res.json({ success: true });
        }
      );
    });
  });

/*
|--------------------------------------------------
| TOGGLE STAFF STATUS
| PUT /api/admin/staff/:id/status
|--------------------------------------------------
*/
router.put("/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "inactive"].includes(status)) {
    return res.json({ success: false });
  }

  db.query(
    "UPDATE users SET status = ? WHERE id = ? AND role = 'staff'",
    [status, id],
    (err, result) => {
      if (err || result.affectedRows === 0) {
        return res.json({ success: false });
      }
      res.json({ success: true });
    }
  );
});

/*
|--------------------------------------------------
| DELETE STAFF (SAFE)
| DELETE /api/admin/staff/:id
|--------------------------------------------------
*/
router.delete("/:id", (req, res) => {
    const { id } = req.params;
  
    // 1️⃣ Check if staff is used in appointments
    db.query(
      "SELECT COUNT(*) AS total FROM appointments WHERE doctor = ?",
      [id],
      (err, rows) => {
        if (err) {
          console.error("CHECK STAFF APPOINTMENTS ERROR:", err);
          return res.status(500).json({ success: false });
        }
  
        if (rows[0].total > 0) {
          return res.json({
            success: false,
            message: "Staff is assigned to appointments and cannot be deleted",
          });
        }
  
        // 2️⃣ Safe to delete
        db.query(
          "DELETE FROM users WHERE id = ? AND role = 'staff'",
          [id],
          (err, result) => {
            if (err) {
              console.error("DELETE STAFF ERROR:", err);
              return res.status(500).json({ success: false });
            }
  
            if (result.affectedRows === 0) {
              return res.json({
                success: false,
                message: "Staff not found",
              });
            }
  
            res.json({ success: true });
          }
        );
      }
    );
  });

  /*
|--------------------------------------------------
| UPDATE STAFF
| PUT /api/admin/staff/:id
|--------------------------------------------------
*/
router.put("/:id", upload.single("image"), (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.json({ success: false, message: "Missing fields" });
  }

  // If image uploaded
  if (req.file) {
    const imageUrl = req.file.path;

    db.query(
      "UPDATE users SET name=?, email=?, image=? WHERE id=? AND role='staff'",
      [name, email.toLowerCase(), imageUrl, id],
      (err, result) => {
        if (err || result.affectedRows === 0) {
          return res.json({ success: false, message: "Update failed" });
        }

        res.json({ success: true });
      }
    );
  } else {
    // No image uploaded
    db.query(
      "UPDATE users SET name=?, email=? WHERE id=? AND role='staff'",
      [name, email.toLowerCase(), id],
      (err, result) => {
        if (err || result.affectedRows === 0) {
          return res.json({ success: false, message: "Update failed" });
        }

        res.json({ success: true });
      }
    );
  }
});

  router.post("/:id/image", upload.single("image"), (req, res) => {
    const { id } = req.params;
  
    if (!req.file) {
      return res.status(400).json({ success: false });
    }
  
    const imageUrl = req.file.path;
  
    db.query(
      "UPDATE users SET image=? WHERE id=? AND role='staff'",
      [imageUrl, id],
      (err) => {
        if (err) return res.status(500).json({ success: false });
  
        res.json({ success: true, image: imageUrl });
      }
    );
  });

  /*
|--------------------------------------------------
| RESET STAFF PASSWORD
| POST /api/admin/staff/:id/reset-password
|--------------------------------------------------
*/
router.post("/:id/reset-password", async (req, res) => {
  const { id } = req.params;

  try {
    // generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);

    const hashed = await bcrypt.hash(tempPassword, 10);

    db.query(
      "UPDATE users SET password=? WHERE id=? AND role='staff'",
      [hashed, id],
      (err, result) => {
        if (err) {
          console.error("RESET PASSWORD ERROR:", err);
          return res.status(500).json({ success: false });
        }

        if (result.affectedRows === 0) {
          return res.json({
            success: false,
            message: "Staff not found",
          });
        }

        res.json({
          success: true,
          password: tempPassword, // send temporary password
        });
      }
    );
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ success: false });
  }
});
module.exports = router;
