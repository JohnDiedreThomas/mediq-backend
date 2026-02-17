const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const adminAuth = require("../middleware/adminAuth");

router.use(adminAuth);

/*
|--------------------------------------------------
| GET ALL STAFF
| GET /api/admin/staff
|--------------------------------------------------
*/
router.get("/", (req, res) => {
  db.query(
    "SELECT id, name, email, status FROM users WHERE role = 'staff' ORDER BY id DESC",
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
router.post("/", (req, res) => {
    const { name, email, password } = req.body;
  
    if (!name || !email || !password) {
      return res.json({ success: false, message: "Missing fields" });
    }
  
    const bcrypt = require("bcryptjs");
  
    bcrypt.hash(password, 10, (err, hashed) => {
      if (err) return res.status(500).json({ success: false });
  
      db.query(
        "INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, 'staff', 'active')",
        [name, email.toLowerCase(), hashed],
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
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const { name, email } = req.body;
  
    if (!name || !email) {
      return res.json({ success: false, message: "Missing fields" });
    }
  
    db.query(
      "UPDATE users SET name = ?, email = ? WHERE id = ? AND role = 'staff'",
      [name, email.toLowerCase(), id],
      (err, result) => {
        if (err || result.affectedRows === 0) {
          return res.json({ success: false, message: "Update failed" });
        }
  
        res.json({ success: true });
      }
    );
  });
module.exports = router;
