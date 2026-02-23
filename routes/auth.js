const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();
const sendEmail = require("../utils/email");

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

        db.query(insertSql, [name, cleanEmail, phone, hashedPassword], async (err) => {
        if (err) {
          console.error("INSERT ERROR:", err);
          return res.status(500).json({ success: false });
        }

        try {
          await sendEmail(
            cleanEmail,
            "Welcome to MediQ",
            "Your account has been created successfully. Welcome to MediQ!"
          );
        } catch (emailErr) {
          console.error("EMAIL ERROR:", emailErr);
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

/* =====================
   LOGOUT — CLEAR PRESENCE
===================== */
router.post("/logout", (req, res) => {
  const { userId } = req.body;

  console.log("Logout request body:", req.body);

  if (!userId) {
    console.log("No userId provided");
    return res.status(400).json({ success: false });
  }

  db.query(
    `UPDATE users
SET latitude = NULL,
    longitude = NULL,
    last_location_update = NULL
WHERE id = ?`,
    [userId],
    (err, result) => {

      if (err) {
        console.error("LOGOUT ERROR:", err);
        return res.status(500).json({ success: false });
      }

      console.log("Logout DB result:", result);

      res.json({ success: true });
    }
  );
});

/* =====================
   RESET LINK CLICK (GET)
===================== */
router.get("/reset-password", (req, res) => {
  const { token } = req.query;
  res.redirect(`mediq://auth/reset-password?token=${token}`);
});
router.post("/forgot-password", (req, res) => {
  const email = req.body.email?.trim().toLowerCase();

  if (!email) return res.json({ success: false });

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  db.query(
    "UPDATE users SET reset_token=?, reset_expires=? WHERE email=?",
    [token, expires, email],
    async (err, result) => {
      if (err || result.affectedRows === 0) {
        return res.json({ success: true });
      }

      const link = `${process.env.BASE_URL}/api/reset-password?token=${token}`;

      try {
        await sendEmail(
          email,
          "Reset your password",
          `Click here to reset your password:\n${link}\n\nLink expires in 15 minutes.`
        );
      } catch (e) {
        console.error("RESET EMAIL ERROR:", e);
      }

      res.json({ success: true });
    }
  );
});

router.post("/reset-password", async (req, res) => {

  const { token, password } = req.body;

  if (!token || !password) {
    return res.json({ success: false });
  }

  const sql = `
    SELECT id FROM users
    WHERE reset_token = ?
    AND reset_expires > NOW()
  `;

  db.query(sql, [token], async (err, rows) => {
    if (rows.length === 0) {
      return res.json({ success: false, message: "Invalid token" });
    }

    const hashed = await bcrypt.hash(password, 10);

    db.query(
      `UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?`,
      [hashed, rows[0].id],
      () => res.json({ success: true })
    );
  });
});


module.exports = router;
