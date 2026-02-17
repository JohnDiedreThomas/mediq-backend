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
    if (err) return res.json({ success: false });

    res.json({
      success: true,
      count: rows[0].unreadCount,
    });
  });
});

/* MARK ALL AS READ */
router.put("/read/:userId", (req, res) => {
  const { userId } = req.params;

  const sql = `
    UPDATE notifications
    SET is_read = 1
    WHERE user_id = ?
  `;

  db.query(sql, [userId], (err) => {
    if (err) {
      console.error("MARK READ ERROR:", err);
      return res.json({ success: false });
    }

    res.json({ success: true });
  });
});

/* GET notifications */
router.get("/:userId", (req, res) => {
  const { userId } = req.params;

  const sql = `
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) return res.json({ success: false });

    res.json({ success: true, notifications: rows });
  });
});

/* DELETE notification */
router.delete("/:id", (req, res) => {
  db.query(
    "DELETE FROM notifications WHERE id = ?",
    [req.params.id],
    () => res.json({ success: true })
  );
});

module.exports = router;
