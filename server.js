const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Load Google credentials
const credentials = JSON.parse(fs.readFileSync('google-credentials.json'));
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST route to receive email and send OTP
app.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'Email is required' });

  const otp = generateOTP();

  try {
    // Send OTP email
    await transporter.sendMail({
      from: `"OTP Server" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is: ${otp}`,
    });

    // Store OTP in Google Sheet
    const spreadsheetId = process.env.SHEET_ID;
    const rangeA1 = `${email}!A1`;
    const rangeA3 = `${email}!A3`;

    // Check if sheet exists
    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = sheetMeta.data.sheets.some(
      (s) => s.properties.title === email
    );
    if (!sheetExists) {
      return res.status(404).json({ error: 'Sheet with this email not found' });
    }

    // Double-check A1 has same email
    const a1Res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: rangeA1,
    });
    if (a1Res.data.values?.[0]?.[0] !== email) {
      return res.status(400).json({ error: 'A1 cell does not match email' });
    }

    // Write OTP to A3
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: rangeA3,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[otp]],
      },
    });

    // Clear OTP after 3 minutes
    setTimeout(async () => {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: rangeA3,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['']],
        },
      });
      console.log(`OTP for ${email} cleared`);
    }, 3 * 60 * 1000);

    res.status(200).json({ message: 'OTP sent and stored successfully' });
  } catch (error) {
    console.error('Error sending OTP:', error.message);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
