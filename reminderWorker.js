const db = require("./db");
const { sendPushNotification } = require("./pushNotification");

function startReminderWorker() {
  console.log("🕒 Reminder worker running...");

  setInterval(() => {
    console.log("Checking appointment reminders...");

    const sql = `
      SELECT 
        a.id,
        a.date,
        a.time,
        a.service,
        a.user_id,
        u.push_token,
        d.name AS doctor_name
      FROM appointments a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN doctors d ON d.id = a.doctor
      WHERE a.status = 'approved'
        AND a.reminder_sent = 0
    `;

    db.query(sql, async (err, rows) => {
      if (err) {
        console.error("Reminder query error:", err);
        return;
      }

      const now = new Date();

      for (const appt of rows) {
        const apptDateTime = new Date(appt.date + "T" + convertTo24Hour(appt.time));
        const diffMinutes = (apptDateTime - now) / (1000 * 60);

        // 🔔 send reminder 60 minutes before
        if (diffMinutes > 0 && diffMinutes <= 60) {
          if (appt.push_token) {
            const serviceName = appt.service || "Appointment";
            const doctorName = appt.doctor_name || "Doctor";
            const appointmentTime = appt.time;

            const apptDate = new Date(appt.date);
            const isToday =
              apptDate.toDateString() === now.toDateString();

            const message = isToday
              ? `Reminder: You have an appointment for ${serviceName} with ${doctorName} at ${appointmentTime} today`
              : `Reminder: You have an appointment for ${serviceName} with ${doctorName} at ${appointmentTime} tomorrow`;

            await sendPushNotification(
              appt.push_token,
              "🔔 Mediq",
              message
            );
          }

          db.query(
            "UPDATE appointments SET reminder_sent = 1 WHERE id = ?",
            [appt.id]
          );

          console.log("Reminder sent for appointment:", appt.id);
        }
      }
    });
  }, 300000); // every 5 minutes
}

module.exports = startReminderWorker;
