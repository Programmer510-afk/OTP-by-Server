require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const app = express();
app.use(express.json());
app.use(cors());

const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');

if (!fs.existsSync(CREDENTIALS_PATH)) {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  fs.writeFileSync(CREDENTIALS_PATH, credentialsJson);
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({ credentials, scopes });
const sheets = google.sheets({ version: 'v4', auth });

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ✅ OTP পাঠানো এবং ৩ মিনিট পর মুছে ফেলা
app.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const otp = generateOTP();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is: ${otp}. It is valid for 3 minutes.`,
    });

    const spreadsheetId = process.env.SHEET_ID;
    const sheetName = email;

    // ✅ A3 সেলে OTP লিখে দাও
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A3`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[otp]],
      },
    });

    // ✅ ৩ মিনিট পরে A3 খালি করে দাও
    setTimeout(async () => {
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A3`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [['']],
          },
        });
        console.log(`✅ OTP deleted from ${sheetName}!A3`);
      } catch (deleteErr) {
        console.error(`❌ OTP delete failed for ${sheetName}:`, deleteErr.message);
      }
    }, 3 * 60 * 1000);

    res.json({ message: 'OTP sent and saved in Google Sheet' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OTP Server running on port ${PORT}`));
