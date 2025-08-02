require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');

// credentials ফাইল না থাকলে env থেকে তৈরি করবে
if (!fs.existsSync(CREDENTIALS_PATH)) {
  fs.writeFileSync(CREDENTIALS_PATH, process.env.GOOGLE_CREDENTIALS_JSON);
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes,
});

const sheets = google.sheets({ version: 'v4', auth });

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

// OTP cache to store OTPs with timestamps (to clear after 3 min)
const otpStore = {};

// OTP পাঠানো API
app.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const otp = generateOTP();

    // ইমেইল পাঠানো
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is: ${otp}. It is valid for 3 minutes.`,
    });

    // Google Sheet আপডেট
    const spreadsheetId = process.env.SHEET_ID;
    const sheetName = email; // Email এর নাম sheet ধরে নিচ্ছি (তুমি sheetName পরিবর্তন করতে পারো)

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A3`,
      valueInputOption: 'RAW',
      requestBody: { values: [[otp]] },
    });

    // OTP স্টোরে রাখো এবং টাইম সেট করো
    otpStore[email] = { otp, timestamp: Date.now() };

    res.json({ message: 'OTP sent and saved in Google Sheet', otp }); // dev purpose otp রিটার্ন করলাম
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ৩ মিনিট পর OTP মুছে ফেলার জন্য cron job (প্রতি মিনিটে চেক করবে)
cron.schedule('* * * * *', async () => {
  const now = Date.now();
  const spreadsheetId = process.env.SHEET_ID;

  for (const email in otpStore) {
    const data = otpStore[email];
    // যদি 3 মিনিট হয়ে যায়
    if (now - data.timestamp > 3 * 60 * 1000) {
      try {
        // Google Sheet থেকে OTP মুছে ফেলো
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${email}!A3`,
          valueInputOption: 'RAW',
          requestBody: { values: [['']] },
        });

        // otpStore থেকে ডিলিট করো
        delete otpStore[email];
        console.log(`Cleared OTP for ${email}`);
      } catch (err) {
        console.error('Error clearing OTP:', err);
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
