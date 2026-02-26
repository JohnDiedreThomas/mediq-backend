const db = require("../db");

async function runDailyCleanup() {
  console.log("🧹 Running system cleanup...");

  try {
    await db.promise().query(`
      UPDATE appointments
      SET status = 'completed', arrived = 0
      WHERE status = 'approved'
      AND CONCAT(date, ' ', time) < NOW()
    `);

    await db.promise().query(`
      UPDATE doctor_availability
      SET status = 'expired'
      WHERE date < CURDATE()
    `);

    console.log("✅ Cleanup done");
  } catch (err) {
    console.error("🔥 Cleanup error:", err.message);
  }
}

module.exports = runDailyCleanup;