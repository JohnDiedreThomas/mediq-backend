let resend = null;

if (process.env.RESEND_API_KEY) {
  const { Resend } = require("resend");
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.log("⚠️ RESEND_API_KEY not found. Email service disabled.");
}

const sendEmail = async (to, subject, text) => {
  if (!resend) {
    console.log("📭 Email skipped (no API key)");
    return;
  }

  try {
    await resend.emails.send({
      from: "MediQ <onboarding@resend.dev>",
      to,
      subject,
      text,
    });

    console.log("✅ Email sent to:", to);
  } catch (err) {
    console.error("❌ EMAIL SEND ERROR:", err);
  }
};

module.exports = sendEmail;