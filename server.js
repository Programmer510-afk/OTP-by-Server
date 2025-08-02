const express = require("express");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Write google-credentials.json from base64 (for Render)
const credentialsPath = path.join(__dirname, "google-credentials.json");
if (!fs.existsSync(credentialsPath)) {
  const base64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  const decoded = Buffer.from(base64, "base64").toString("utf8");
  fs.writeFileSync(credentialsPath, decoded);
}

const auth = new google.auth.GoogleAuth({
  keyFile: credentialsPath,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate random 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

app.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const otp = generateOTP();

  // Send OTP Email
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP is: ${otp}. It will expire in 3 minutes.`,
    });
    console.log(`OTP ${otp} sent to ${email}`);
  } catch (err) {
    console.error("Email sending error:", err);
    return res.status(500).json({ error: "Failed to send email" });
  }

  // Write OTP to Google Sheet
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const sheetName = email; // Sheet name same as email
    const sheetId = process.env.SHEET_ID;

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A3`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[otp]],
      },
    });

    console.log(`OTP written to ${sheetName}!A3`);

    // Clear OTP after 3 minutes
    setTimeout(async () => {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!A3`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[""]],
        },
      });
      console.log(`OTP cleared from ${sheetName}!A3`);
    }, 3 * 60 * 1000); // 3 minutes
  } catch (err) {
    console.error("Google Sheets error:", err);
    return res.status(500).json({ error: "Failed to write to Google Sheet" });
  }

  res.status(200).json({ message: "OTP sent and saved to sheet" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
