const express = require("express");
const router = express.Router();
const db = require("../db");

/* GET unread notification count */
router.get("/count/:userId", (req, res) => {

  const { userId } = req.params;

  const sql = `
    SELECT COUNT(*) AS unreadCount
    FROM notifications
    WHERE user_id = ? AND is_read = 0
  `;

  db.query(sql, [userId], (err, rows) => {

    if (err) return res.json({ success:false });

    res.json({
      success:true,
      count:rows[0].unreadCount
    });

  });

});

/* MARK ALL AS READ */
router.put("/read/:userId", (req, res) => {

  const { userId } = req.params;

  db.query(
    `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
    [userId],
    (err) => {

      if (err) {
        console.error("MARK READ ERROR:", err);
        return res.json({ success:false });
      }

      res.json({ success:true });

    }
  );

});

/* DELETE ALL USER NOTIFICATIONS */
router.delete("/user/:userId", (req, res) => {

  const { userId } = req.params;

  db.query(
    "DELETE FROM notifications WHERE user_id = ?",
    [userId],
    (err) => {

      if (err) {
        console.error("DELETE ALL ERROR:", err);
        return res.json({ success:false });
      }

      res.json({ success:true });

    }
  );

});

/* DELETE SINGLE NOTIFICATION */
router.delete("/:id/:userId", (req, res) => {

  const { id, userId } = req.params;

  db.query(
    "DELETE FROM notifications WHERE id = ? AND user_id = ?",
    [id, userId],
    (err) => {

      if (err) {
        console.error("DELETE NOTIF ERROR:", err);
        return res.json({ success:false });
      }

      res.json({ success:true });

    }
  );

});

/* STAFF NOTIFICATIONS */
router.get("/staff", (req, res) => {

  db.query(
    `
    SELECT 
      id,
      title,
      message,
      is_read,
      DATE_FORMAT(
        created_at + INTERVAL 8 HOUR,
        '%b %d, %Y, %h:%i %p'
      ) AS created_at
    FROM staff_notifications
    ORDER BY staff_notifications.created_at DESC
    LIMIT 50
    `,
    (err, rows) => {

      if (err) {
        console.error("STAFF NOTIF ERROR:", err);
        return res.json({ success:false });
      }

      res.json({
        success:true,
        notifications:rows
      });

    }
  );

});

/* MARK ALL STAFF NOTIFICATIONS AS READ */
router.put("/staff/read", (req, res) => {

  db.query(
    "UPDATE staff_notifications SET is_read = 1",
    (err) => {

      if (err) {
        console.error("STAFF READ ERROR:", err);
        return res.json({ success:false });
      }

      res.json({ success:true });

    }
  );

});

/* DELETE SINGLE STAFF NOTIFICATION */
router.delete("/staff/:id", (req, res) => {

  const { id } = req.params;

  db.query(
    "DELETE FROM staff_notifications WHERE id = ?",
    [id],
    (err) => {

      if (err) {
        console.error("DELETE STAFF ERROR:", err);
        return res.json({ success:false });
      }

      res.json({ success:true });

    }
  );

});

/* GET MUTE STATUS */
router.get("/mute/:userId", (req, res) => {

  const { userId } = req.params;

  db.query(
    "SELECT mute_notifications FROM users WHERE id = ?",
    [userId],
    (err, rows) => {

      if (err || rows.length === 0) {
        return res.json({ success: false });
      }

      res.json({
        success: true,
        mute: rows[0].mute_notifications
      });

    }
  );

});

router.put("/mute/:userId",(req,res)=>{

  const { userId } = req.params;
  const { mute } = req.body;

  db.query(
    "UPDATE users SET mute_notifications=? WHERE id=?",
    [mute,userId],
    err => {

      if(err) return res.json({success:false});

      res.json({success:true});

    }
  );

});

/* GET USER NOTIFICATIONS */
router.get("/:userId", (req, res) => {

  const { userId } = req.params;

  db.query(
    `
    SELECT 
  id,
  user_id,
  title,
  message,
  is_read,
  DATE_FORMAT(
    created_at + INTERVAL 8 HOUR,
    '%b %d, %Y, %h:%i %p'
  ) AS created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY notifications.created_at DESC
    LIMIT 50
    `,
    [userId],
    (err, rows) => {

      if (err) {
        console.error("NOTIF FETCH ERROR:", err);
        return res.json({ success:false });
      }

      res.json({
        success:true,
        notifications:rows
      });

    }
  );
});



module.exports = router;