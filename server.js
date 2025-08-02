require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// CORS সেটআপ (যেহেতু ফ্রন্টএন্ড অন্য জায়গা থেকে কল করতে পারে)
app.use(cors());

// Google credentials json path
const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');

// credentials ফাইল না থাকলে env থেকে তৈরি করবে
if (!fs.existsSync(CREDENTIALS_PATH)) {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  fs.writeFileSync(CREDENTIALS_PATH, credentialsJson);
}

// Google API সেটআপ
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes,
});
const sheets = google.sheets({ version: 'v4', auth });

// Nodemailer setup with Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// OTP জেনারেটর
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// OTP পাঠানোর এন্ডপয়েন্ট
app.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const otp = generateOTP();

    // Nodemailer দিয়ে ইমেইল পাঠানো
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is: ${otp}. It is valid for 3 minutes.`,
    });

    // Google Sheet ID
    const spreadsheetId = process.env.SHEET_ID;
    const sheetName = email;

    // OTP Google Sheets এ আপডেট করা
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A3`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[otp]],
      },
    });

    res.json({ message: 'OTP sent and saved in Google Sheet' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OTP Server running on port ${PORT}`));
