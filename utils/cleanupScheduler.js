const db = require("../db");

function runDailyCleanup() {
  console.log("🧹 Running system cleanup...");

  db.query(`
    UPDATE appointments
    SET status='completed', arrived=0
    WHERE status='approved'
    AND STR_TO_DATE(CONCAT(date,' ',time), '%Y-%m-%d %h:%i %p') < NOW()
  `, (err) => {
    if (err) console.log("Cleanup appointments error:", err);
  });

  db.query(`
    UPDATE doctor_availability
    SET status='expired'
    WHERE date < CURDATE()
  `, (err) => {
    if (err) console.log("Cleanup availability error:", err);
  });
}

module.exports = runDailyCleanup;