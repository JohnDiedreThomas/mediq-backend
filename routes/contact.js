const express = require("express");
const router = express.Router();
const db = require("../db");

/*
|--------------------------------------------------
| GET CONTACT INFO
| GET /api/contact
|--------------------------------------------------
*/
router.get("/", async (req, res) => {
  try {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM contact_info LIMIT 1");

    res.json({
      success: true,
      contact: rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
