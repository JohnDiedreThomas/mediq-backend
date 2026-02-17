const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

router.get("/login-test", (req, res) => {
  res.send("AUTH ROUTE WORKING");
});

/* =====================
   REGISTER
===================== */
router.post("/register", async (req, res) => {
  const { name, email, phone, password } = req.body;
  const cleanEmail = email.trim().toLowerCase();

  if (!name || !email || !phone || !password) {
    return res.json({ success: false, message: "Missing fields" });
  }

  try {
    // 1️⃣ Check if email already exists
    const checkSql = "SELECT id FROM users WHERE email = ?";
    db.query(checkSql, [cleanEmail], async (err, results) => {
      if (err) {
        console.error("EMAIL CHECK ERROR:", err);
        return res.status(500).json({ success: false });
      }

      if (results.length > 0) {
        // Email already exists
        return res.json({ success: false, message: "Email exists" });
      }

      // 2️⃣ Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // 3️⃣ Insert user
      const insertSql =
        "INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'patient')";

        db.query(insertSql, [name, cleanEmail, phone, hashedPassword], (err) => {
        if (err) {
          console.error("INSERT ERROR:", err);
          return res.status(500).json({ success: false });
        }

        return res.json({ success: true });
      });
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ success: false });
  }
});

/* =====================
   LOGIN
===================== */
router.post("/login", (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password?.trim();

  console.log("LOGIN EMAIL:", email);
  console.log("LOGIN PASSWORD:", password);

  if (!email || !password) {
    return res.json({ success: false });
  }

  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error("LOGIN QUERY ERROR:", err);
      return res.status(500).json({ success: false });
    }

    if (results.length === 0) {
      console.log("NO USER FOUND");
      return res.json({ success: false });
    }

    const user = results[0];

    const isMatch = await bcrypt.compare(
      password,
      user.password.trim()
    );

    console.log("BCRYPT MATCH:", isMatch);

    if (!isMatch) {
      return res.json({ success: false });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  });
});


/* =====================
   GET MY PROFILE
===================== */
router.get("/me/:id", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT id, name, email, phone, role
    FROM users
    WHERE id = ?
  `;

  db.query(sql, [id], (err, rows) => {
    if (err || rows.length === 0) {
      return res.json({ success: false });
    }

    res.json({
      success: true,
      user: rows[0],
    });
  });
});

/* =====================
   UPDATE PROFILE (REAL SYSTEM)
===================== */
router.put("/profile/:id", async (req, res) => {
  const { id } = req.params;
  const { name, phone, password } = req.body;

  if (!name) {
    return res.json({ success: false, message: "Name required" });
  }

  try {
    let sql;
    let params;

    if (password && password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);

      sql = `
        UPDATE users
        SET name = ?, phone = ?, password = ?
        WHERE id = ?
      `;
      params = [name, phone || null, hashedPassword, id];
    } else {
      sql = `
        UPDATE users
        SET name = ?, phone = ?
        WHERE id = ?
      `;
      params = [name, phone || null, id];
    }

    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("PROFILE UPDATE ERROR:", err);
        return res.status(500).json({ success: false });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "Profile updated successfully",
      });
    });
  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* =====================
   SAVE PUSH TOKEN
===================== */
router.post("/save-token", (req, res) => {
  const { userId, pushToken } = req.body;

  if (!userId || !pushToken) {
    return res.status(400).json({
      success: false,
      message: "Missing userId or pushToken",
    });
  }

  const sql = `
    UPDATE users
    SET push_token = ?
    WHERE id = ?
  `;

  db.query(sql, [pushToken, userId], (err, result) => {
    if (err) {
      console.error("SAVE TOKEN ERROR:", err);
      return res.status(500).json({ success: false });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "Push token saved",
    });
  });
});



module.exports = router;
