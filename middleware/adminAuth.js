const db = require("../db");

module.exports = (req, res, next) => {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Missing user ID",
    });
  }

  const sql = `
    SELECT role, status
    FROM users
    WHERE id = ?
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err || rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid user",
      });
    }

    const user = rows[0];

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Account disabled",
      });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access only",
      });
    }

    next(); // ✅ admin allowed
  });
};