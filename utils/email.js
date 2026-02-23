const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (to, subject, link) => {
  await transporter.sendMail({
    from: `"MediQ Clinic" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: `
      <p>You requested a password reset.</p>
      <p>Click below:</p>
      <a href="${link}" style="background:#2F80ED;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">
        Reset Password
      </a>
      <p>If you didn’t request this, ignore this email.</p>
    `,
  });
};

module.exports = sendEmail;