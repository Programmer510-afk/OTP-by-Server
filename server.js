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

// ✅ Google credentials সেটআপ
const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');
if (!fs.existsSync(CREDENTIALS_PATH)) {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  fs.writeFileSync(CREDENTIALS_PATH, credentialsJson);
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes,
});
const sheets = google.sheets({ version: 'v4', auth });

// ✅ Nodemailer সেটআপ
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ OTP জেনারেটর ফাংশন
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ✅ শীটের নামকে নিরাপদ করতে sanitize করার ফাংশন
function sanitizeSheetName(email) {
  // অক্ষর, সংখ্যা ছাড়া সব কিছু '_' দিয়ে রিপ্লেস করবে
  // গুগল শীটের শীট নামের লিমিট 100 ক্যারেক্টার, তাই কাটা হয়েছে
  return email.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 100);
}

// ✅ OTP পাঠানোর API এন্ডপয়েন্ট
app.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const otp = generateOTP();

    // 🔔 ইমেইলে OTP পাঠানো
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is: ${otp}. It is valid for 3 minutes.`,
    });

    const spreadsheetId = process.env.SHEET_ID;

    // 🛡️ ইমেইল থেকে নিরাপদ শীট নাম তৈরি করা হচ্ছে
    const sheetName = sanitizeSheetName(email);

    // 📥 OTP A3 সেলে সংরক্ষণ করা হচ্ছে
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A3`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[otp]],
      },
    });

    // ⏱️ ৩ মিনিট পর OTP মুছে ফেলা হবে
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
        console.log(`OTP cleared from ${email}'s sheet after 3 minutes.`);
      } catch (clearError) {
        console.error("Error clearing OTP after timeout:", clearError);
      }
    }, 180000); // ৩ মিনিট

    res.json({ message: 'OTP sent and saved in Google Sheet' });
  } catch (error) {
    console.error("OTP Error:", error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OTP Server running on port ${PORT}`));
