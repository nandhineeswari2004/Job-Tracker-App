const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/mailer');

router.post('/test', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ message: 'Provide "to" in body' });

    const info = await sendMail({
      to,
      subject: 'Test email from Job Tracker',
      text: 'This is a test email.',
      html: '<strong>This is a test email.</strong>'
    });

    res.json({ message: 'Email sent', info });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Send failed', error: err.message });
  }
});

module.exports = router;
