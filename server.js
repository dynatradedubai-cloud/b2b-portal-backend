const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const CryptoJS = require("crypto-js");
const { RateLimiterMemory } = require("rate-limiter-flexible");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

/* ================= MEMORY STORE (TEMP) ================= */
let users = [];
let otpStore = {};
let auditLogs = [];

/* ================= RATE LIMIT ================= */
const loginLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60
});

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SENDER_EMAIL,
    pass: process.env.SENDER_APP_PASSWORD
  }
});

/* ================= HELPERS ================= */

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function logEvent(event) {
  auditLogs.unshift({
    time: new Date().toISOString(),
    ...event
  });
  if (auditLogs.length > 1000) auditLogs.pop();
}

/* ================= ADMIN LOGIN ================= */

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
      expiresIn: "1h"
    });

    return res.json({ token });
  }

  return res.status(401).json({ message: "Invalid admin login" });
});

/* ================= USER LOGIN ================= */

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    await loginLimiter.consume(username);
  } catch {
    return res.status(429).json({ message: "Too many attempts" });
  }

  const user = users.find((u) => u.username === username);

  if (!user) {
    logEvent({ event: "Invalid Username", username });
    return res.status(400).json({ message: "User not found" });
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    logEvent({ event: "Wrong Password", username });
    return res.status(400).json({ message: "Wrong password" });
  }

  const otp = generateOTP();
  const hash = await bcrypt.hash(otp, 10);

  otpStore[username] = {
    hash,
    expires: Date.now() + 5 * 60 * 1000,
    attempts: 0
  };

  await transporter.sendMail({
    from: process.env.SENDER_EMAIL,
    to: user.email,
    subject: "Your OTP",
    text: `Your OTP is ${otp}`
  });

  logEvent({ event: "OTP Sent", username });

  res.json({ message: "OTP sent" });
});

/* ================= VERIFY OTP ================= */

app.post("/verify-otp", async (req, res) => {
  const { username, otp } = req.body;

  const record = otpStore[username];

  if (!record) return res.status(400).json({ message: "No OTP found" });

  if (Date.now() > record.expires)
    return res.status(400).json({ message: "OTP expired" });

  const match = await bcrypt.compare(otp, record.hash);

  if (!match) {
    record.attempts++;

    if (record.attempts >= 3) {
      logEvent({ event: "Account Blocked", username });
      return res.status(403).json({ message: "Blocked after 3 attempts" });
    }

    return res.status(400).json({ message: "Wrong OTP" });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "1h"
  });

  delete otpStore[username];

  logEvent({ event: "Login Success", username });

  res.json({ token });
});

/* ================= PROTECTED ================= */

function auth(req, res, next) {
  const token = req.headers.authorization;

  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

/* ================= SAMPLE DATA ================= */

app.post("/admin/create-user", async (req, res) => {
  const { username, password, email, name } = req.body;

  const hash = await bcrypt.hash(password, 10);

  users.push({
    username,
    password: hash,
    email,
    name
  });

  res.json({ message: "User created" });
});

/* ================= AUDIT ================= */

app.get("/admin/logs", (req, res) => {
  res.json(auditLogs.slice(0, 10));
});

/* ================= START ================= */

app.listen(process.env.PORT, () => {
  console.log("Server running on port", process.env.PORT);
});
