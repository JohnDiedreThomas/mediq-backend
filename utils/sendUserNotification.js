const db = require("../db");
const { sendPushNotification } = require("../pushNotification");

async function sendUserNotification(userId, title, message) {

  db.query(
    "SELECT push_token, mute_notifications FROM users WHERE id = ?",
    [userId],
    async (err, rows) => {

      if (err || rows.length === 0) return;

      const user = rows[0];

      /* SAVE IN-APP NOTIFICATION */
      db.query(
        `INSERT INTO notifications (user_id,title,message,is_read)
         VALUES (?, ?, ?, 0)`,
        [userId, title, message]
      );

      /* STOP PUSH IF MUTED */
      if (user.mute_notifications) return;

      /* SEND PUSH */
      if (user.push_token) {
        await sendPushNotification(
          user.push_token,
          title,
          message
        );
      }

    }
  );

}

module.exports = { sendUserNotification };