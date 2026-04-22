const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const CryptoJS = require("crypto-js");
const multer = require("multer");
const XLSX = require("xlsx");
const moment = require("moment-timezone");
const fs = require("fs");
require("dotenv").config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= STORAGE ================= */
const upload = multer({ dest: "/tmp/" });

let users = [];
let priceList = [];
let otps = {};
let lastUpdated = null;

/* ================= HELPERS ================= */

const normalize = (str) =>
  String(str || "").toLowerCase().replace(/\s+/g, "");

const getValue = (obj, key) => {
  const found = Object.keys(obj).find(
    (k) => normalize(k) === normalize(key)
  );
  return found ? obj[found] : null;
};

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

function getUAETime() {
  return moment().tz("Asia/Dubai").format("DD MMM YYYY, hh:mm A");
}

/* ================= LOAD DATA ON START ================= */

const loadData = () => {
  try {
    if (fs.existsSync("price.enc")) {
      const enc = fs.readFileSync("price.enc", "utf8");
      priceList = decrypt(enc);
      console.log("Price list loaded:", priceList.length);
    }

    if (fs.existsSync("users.enc")) {
      const enc = fs.readFileSync("users.enc", "utf8");
      users = decrypt(enc);
      console.log("Users loaded:", users.length);
    }
  } catch (err) {
    console.log("Load error:", err.message);
  }
};

loadData();

/* ================= EMAIL ================= */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SENDER_EMAIL,
    pass: process.env.SENDER_APP_PASSWORD
  }
});

/* ================= ADMIN LOGIN ================= */

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

/* ================= USER LOGIN ================= */

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find((u) => u.username === username);
  if (!user) return res.status(400).json({ message: "User not found" });

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ message: "Wrong password" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otps[username] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000
  };

  transporter.sendMail({
    from: process.env.SENDER_EMAIL,
    to: user.email,
    subject: "OTP Login",
    text: `Your OTP is ${otp}`
  });

  res.json({ message: "OTP sent" });
});

/* ================= VERIFY OTP ================= */

app.post("/verify-otp", (req, res) => {
  const { username, otp } = req.body;

  const record = otps[username];
  if (!record) return res.status(400).json({ message: "No OTP" });

  if (record.expires < Date.now())
    return res.status(400).json({ message: "OTP expired" });

  if (record.otp !== otp)
    return res.status(400).json({ message: "Invalid OTP" });

  delete otps[username];

  const token = jwt.sign({ username }, process.env.JWT_SECRET);

  res.json({ token });
});

/* ================= UPLOAD USERS ================= */

app.post("/admin/upload-users", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file" });

    const wb = XLSX.readFile(req.file.path);
    const sheet = XLSX.utils.sheet_to_json(
      wb.Sheets[wb.SheetNames[0]]
    );

    users = sheet.map((u) => ({
      username: getValue(u, "Username"),
      password: bcrypt.hashSync(String(getValue(u, "Password")), 10),
      name: getValue(u, "Customer Name"),
      code: getValue(u, "Customer Code"),
      email: getValue(u, "Customer email ID"),
      salesman: getValue(u, "Sales Man name"),
      phone: getValue(u, "Salesman contact no."),
      salesEmail: getValue(u, "Salesman Email ID")
    }));

    fs.writeFileSync("users.enc", encrypt(users));

    lastUpdated = getUAETime();

    res.json({ message: "Users uploaded", lastUpdated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

/* ================= UPLOAD PRICE ================= */

app.post("/admin/upload-price", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file" });

    const wb = XLSX.readFile(req.file.path);
    const sheet = XLSX.utils.sheet_to_json(
      wb.Sheets[wb.SheetNames[0]]
    );

    priceList = sheet;

    fs.writeFileSync("price.enc", encrypt(priceList));

    lastUpdated = getUAETime();

    res.json({
      message: "Price uploaded",
      count: priceList.length,
      lastUpdated
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

/* ================= SEARCH (FAST 50K SUPPORT) ================= */

app.post("/search", (req, res) => {
  try {
    const q = normalize(req.body.query);

    const result = priceList
      .filter((p) =>
        Object.values(p)
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 20);

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= LAST UPDATED ================= */

app.get("/last-updated", (req, res) => {
  res.json({ lastUpdated });
});

/* ================= START SERVER ================= */

app.listen(process.env.PORT, () => {
  console.log("Server running on port", process.env.PORT);
});
