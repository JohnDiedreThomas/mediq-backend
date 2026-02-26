const express = require("express");
const multer = require("multer");
const cloudinary = require("../cloudinary"); // your config
const db = require("../db");

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/image", upload.single("image"), async (req, res) => {
    console.log("📸 PROFILE IMAGE UPLOAD HIT");
  try {
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res.status(400).json({ success: false, message: "No user id" });
    }

    const result = await cloudinary.uploader.upload(req.file.path);

    await db.query(
      "UPDATE users SET image=? WHERE id=?",
      [result.secure_url, userId]
    );

    res.json({
      success: true,
      imageUrl: result.secure_url
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;