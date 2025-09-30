// reminder.js
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const db = require("./db");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: (process.env.SMTP_SECURE === "true"),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Helper to send single email
async function sendReminderEmail(to, name, job) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: `Reminder: ${job.company} - ${job.role} (Deadline ${job.deadline})`,
    text: `Hi ${name},\n\nThis is a reminder that your application for ${job.role} at ${job.company} has a deadline on ${job.deadline} (in 3 days).\n\nGood luck!\n\n— Job Tracker`,
    html: `<p>Hi ${name},</p>
           <p>This is a reminder that your application for <strong>${job.role}</strong> at <strong>${job.company}</strong> has a deadline on <strong>${job.deadline}</strong> (in 3 days).</p>
           <p>Good luck!</p>
           <p>— Job Tracker</p>`,
  };

  return transporter.sendMail(mailOptions);
}

// Cron schedule: runs daily at time in CRON_TIME or default 08:00
const schedule = process.env.CRON_TIME || "0 8 * * *";

cron.schedule(schedule, async () => {
  try {
    console.log("🔔 Running reminder cron job");

    // Select jobs whose deadline is exactly 3 days from today and reminder_sent = 0
    // Using MySQL date functions
    const sql = `
      SELECT j.id, j.company, j.role, DATE_FORMAT(j.deadline, '%Y-%m-%d') AS deadline, u.email, u.name
      FROM jobs j
      JOIN users u ON j.user_id = u.id
      WHERE j.reminder_sent = 0
        AND j.deadline = DATE_ADD(CURDATE(), INTERVAL 3 DAY)
    `;

    db.query(sql, async (err, rows) => {
      if (err) {
        return console.error("DB error during reminder query:", err);
      }
      if (!rows.length) return console.log("No reminders to send today.");

      for (const job of rows) {
        try {
          await sendReminderEmail(job.email, job.name, job);
          // mark reminder_sent = 1
          db.query("UPDATE jobs SET reminder_sent = 1 WHERE id = ?", [job.id], (uErr) => {
            if (uErr) console.error("Failed to update reminder_sent for job", job.id, uErr);
          });
          console.log(`Reminder email sent to ${job.email} for job ${job.id}`);
        } catch (sendErr) {
          console.error("Failed to send email to", job.email, sendErr);
        }
      }
    });
  } catch (outerErr) {
    console.error("Reminder cron outer error:", outerErr);
  }
});
