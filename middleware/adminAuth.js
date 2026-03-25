const db = require("../db");

module.exports = (req, res, next) => {
  const userId =
  req.headers["x-user-id"] || // old way (keep working)
  req.headers["authorization"]?.split(" ")[1]; // new way
  console.log("🔐 USER ID:", userId);
  
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
    if (err) {
      console.error("🔥 AUTH DB ERROR:", err);
      return res.status(500).json({
        success: false,
        message: "Auth database error",
      });
    }
    
    if (rows.length === 0) {
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