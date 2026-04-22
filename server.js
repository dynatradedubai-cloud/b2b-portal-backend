const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const CryptoJS = require("crypto-js");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const moment = require("moment-timezone");
const rateLimit = require("express-rate-limit");

require("dotenv").config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "/tmp/" });

/* ================= SECURITY ================= */

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});
app.use(limiter);

/* ================= STORAGE ================= */

let users = [];
let priceList = [];
let logs = [];
let otps = {};
let searchCount = {};
let campaigns = [];
let lastUpdated = null;

/* ================= HELPERS ================= */

const normalize = (s) =>
  String(s || "").toLowerCase().replace(/\s+/g, "");

function encrypt(data) {
  return CryptoJS.AES.encrypt(
    JSON.stringify(data),
    process.env.ENCRYPTION_KEY
  ).toString();
}

function decrypt(data) {
  const bytes = CryptoJS.AES.decrypt(
    data,
    process.env.ENCRYPTION_KEY
  );
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

function logEvent(event) {
  logs.unshift({
    ...event,
    time: new Date().toISOString()
  });
}

function getUAETime() {
  return moment().tz("Asia/Dubai").format("DD MMM YYYY, hh:mm A");
}

/* ================= LOAD DATA ================= */

function loadData() {
  if (fs.existsSync("users.enc")) {
    users = decrypt(fs.readFileSync("users.enc", "utf8"));
  }
  if (fs.existsSync("price.enc")) {
    priceList = decrypt(fs.readFileSync("price.enc", "utf8"));
  }
}

loadData();

/* ================= EMAIL ================= */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SENDER_EMAIL,
    pass: process.env.SENDER_APP_PASSWORD
  }
});

/* ================= AUTH ================= */

function verifyAdmin(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(403).json({ message: "Unauthorized" });

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ message: "Invalid token" });
  }
}

/* ================= ADMIN ================= */

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET);
    return res.json({ token });
  }

  res.status(401).json({ message: "Invalid admin login" });
});

/* ================= UPLOAD USERS ================= */

app.post("/admin/upload-users", verifyAdmin, upload.single("file"), (req, res) => {
  const wb = XLSX.readFile(req.file.path);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  users = data.map((u) => ({
    username: u["Username"],
    password: bcrypt.hashSync(String(u["Password"]), 10),
    name: u["Customer Name"],
    email: u["Customer email ID"],
    salesman: u["Sales Man name"],
    phone: u["Salesman contact no."],
    limit: u["Max search per day"] || 50
  }));

  fs.writeFileSync("users.enc", encrypt(users));
  lastUpdated = getUAETime();

  res.json({ message: "Users uploaded", lastUpdated });
});

/* ================= UPLOAD PRICE ================= */

app.post("/admin/upload-price", verifyAdmin, upload.single("file"), (req, res) => {
  const wb = XLSX.readFile(req.file.path);
  priceList = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  fs.writeFileSync("price.enc", encrypt(priceList));
  lastUpdated = getUAETime();

  res.json({ message: "Price uploaded", count: priceList.length });
});

/* ================= LOGIN ================= */

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find((u) => u.username === username);
  if (!user) {
    logEvent({ type: "invalid_user", username });
    return res.status(400).json({ message: "User not found" });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    logEvent({ type: "wrong_password", username });
    return res.status(400).json({ message: "Wrong password" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otps[username] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000,
    attempts: 0
  };

  transporter.sendMail({
    from: process.env.SENDER_EMAIL,
    to: user.email,
    subject: "OTP Login",
    text: `Your OTP is ${otp}`
  });

  res.json({ message: "OTP sent" });
});

/* ================= OTP ================= */

app.post("/verify-otp", (req, res) => {
  const { username, otp } = req.body;

  const record = otps[username];
  if (!record) return res.status(400).json({ message: "No OTP" });

  if (record.expires < Date.now())
    return res.status(400).json({ message: "Expired OTP" });

  record.attempts++;

  if (record.attempts > 3) {
    logEvent({ type: "otp_block", username });
    return res.status(403).json({ message: "Too many attempts" });
  }

  if (record.otp !== otp)
    return res.status(400).json({ message: "Invalid OTP" });

  delete otps[username];

  const token = jwt.sign({ username }, process.env.JWT_SECRET);

  res.json({ token });
});

/* ================= SEARCH ================= */

app.post("/search", (req, res) => {
  const { query, username } = req.body;

  const user = users.find((u) => u.username === username);

  if (!searchCount[username]) searchCount[username] = 0;

  if (searchCount[username] >= user.limit) {
    return res.status(403).json({ message: "Daily limit reached" });
  }

  searchCount[username]++;

  const q = normalize(query);

  const result = priceList
    .filter((p) =>
      Object.values(p)
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
    .slice(0, 20);

  logEvent({
    type: "search",
    username,
    query,
    found: result.length
  });

  if (result.length === 0) {
    logEvent({ type: "not_found", username, query });
  }

  res.json(result);
});

/* ================= CAMPAIGNS ================= */

app.post("/admin/upload-campaign", verifyAdmin, upload.single("file"), (req, res) => {
  campaigns.push({
    name: req.file.originalname,
    expiry: req.body.expiry
  });

  res.json({ message: "Campaign added" });
});

app.get("/campaigns", (req, res) => {
  const active = campaigns.filter(
    (c) => new Date(c.expiry) > new Date()
  );
  res.json(active);
});

/* ================= LOGS ================= */

app.get("/admin/logs", verifyAdmin, (req, res) => {
  res.json(logs.slice(0, 10));
});

/* ================= START ================= */

app.listen(process.env.PORT, () => {
  console.log("Server running on port", process.env.PORT);
});
