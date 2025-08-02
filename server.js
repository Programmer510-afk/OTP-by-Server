require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

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
    user: process.env.EMAIL_USER,      // যেমন: bdpbdchecker11@gmail.com
    pass: process.env.EMAIL_PASS,      // Gmail app password
  },
});

// OTP জেনারেটর ফাংশন
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// OTP পাঠানো এবং শিট আপডেট করার API
app.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // OTP তৈরি
    const otp = generateOTP();

    // ইমেইল পাঠানো
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is: ${otp}. It is valid for 3 minutes.`,
    });

    // Google Sheet ID (তোমার .env এর মধ্যে থাকবে)
    const spreadsheetId = process.env.SHEET_ID;

    // শীট নাম হিসেবে email ধরে নেওয়া হয়েছে
    const sheetName = email;

    // A3 সেলে OTP আপডেট করা
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A3`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[otp]],
      },
    });

    // 3 মিনিট পর A3 সেল খালি করার জন্য 3 মিনিট পরে কল করা যাবে (এখানে কোনো ব্যাকগ্রাউন্ড জব দেয়া হয়নি)
    // প্রয়োজনে আলাদা টাস্ক/ক্রোন জব দরকার।

    res.json({ message: 'OTP sent and saved in Google Sheet', otp }); // ডেভেলপমেন্টের জন্য otp রিটার্ন করা হয়েছে
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
