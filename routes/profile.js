const express = require("express");
const multer = require("multer");
const cloudinary = require("../cloudinary");
const db = require("../db");

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/image", upload.single("image"), (req, res) => {
  console.log("📸 PROFILE IMAGE UPLOAD HIT");

  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "No user id",
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  // upload to cloudinary
  cloudinary.uploader.upload(req.file.path, (err, result) => {
    if (err) {
      console.log("Cloudinary error:", err);
      return res.status(500).json({ success: false });
    }

    // update DB
    db.query(
      "UPDATE users SET image=? WHERE id=?",
      [result.secure_url, userId],
      (dbErr) => {
        if (dbErr) {
          console.log("DB error:", dbErr);
          return res.status(500).json({ success: false });
        }

        res.json({
          success: true,
          imageUrl: result.secure_url,
        });
      }
    );
  });
});

module.exports = router;