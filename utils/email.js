const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (to, subject, text) => {
  try {
    await transporter.sendMail({
      from: `"MediQ Clinic" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html: `
        <p>Click below to reset your password:</p>
        <a href="${text}">Reset Password</a>
      `,
    });

    console.log("Email sent to:", to);
  } catch (err) {
    console.error("EMAIL SEND ERROR:", err);
  }
};

module.exports = sendEmail;