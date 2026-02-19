const db = require("../db");

function runDailyCleanup() {
  console.log("🧹 Running system cleanup...");

  // Complete approved past appointments
  db.query(`
    UPDATE appointments
    SET status = 'completed', arrived = 0
    WHERE status = 'approved'
    AND CONCAT(date, ' ', time) < NOW()
  `);

  // Expire availability
  db.query(`
    UPDATE doctor_availability
    SET status = 'expired'
    WHERE date < CURDATE()
  `);
}

module.exports = runDailyCleanup;