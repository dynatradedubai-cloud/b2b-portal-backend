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

function encrypt(data) {
  return CryptoJS.AES.encrypt(
    JSON.stringify(data),
    process.env.ENCRYPTION_KEY
  ).toString();
}

function getUAETime() {
  return moment().tz("Asia/Dubai").format("DD MMM YYYY, hh:mm A");
}

/* ================= EMAIL (OTP) ================= */

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
  try {
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
      subject: "Your OTP",
      text: `Your OTP is ${otp}`
    });

    res.json({ message: "OTP sent" });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ================= VERIFY OTP ================= */

app.post("/verify-otp", (req, res) => {
  const { username, otp } = req.body;

  const record = otps[username];
  if (!record) return res.status(400).json({ message: "No OTP" });

  if (record.expires < Date.now()) {
    return res.status(400).json({ message: "OTP expired" });
  }

  if (record.otp !== otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  delete otps[username];

  const token = jwt.sign({ username }, process.env.JWT_SECRET);

  res.json({ token });
});

/* ================= UPLOAD USERS ================= */

app.post("/admin/upload-users", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const workbook = XLSX.readFile(req.file.path);
    const sheet = XLSX.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]]
    );

    const required = [
      "Username",
      "Password",
      "Customer Name",
      "Customer Code",
      "Customer email ID",
      "Sales Man name",
      "Salesman contact no.",
      "Salesman Email ID"
    ];

    for (let col of required) {
      if (!(col in sheet[0])) {
        return res.status(400).json({ message: `Missing column: ${col}` });
      }
    }

    users = sheet.map((u) => ({
      username: u["Username"],
      password: bcrypt.hashSync(String(u["Password"]), 10),
      name: u["Customer Name"],
      code: u["Customer Code"],
      email: u["Customer email ID"],
      salesman: u["Sales Man name"],
      phone: u["Salesman contact no."],
      salesEmail: u["Salesman Email ID"]
    }));

    fs.writeFileSync("users.enc", encrypt(users));

    lastUpdated = getUAETime();

    res.json({ message: "Users uploaded", lastUpdated });

  } catch (err) {
    console.error("UPLOAD USERS ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ================= UPLOAD PRICE ================= */

app.post("/admin/upload-price", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const workbook = XLSX.readFile(req.file.path);
    const sheet = XLSX.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]]
    );

    const required = [
      "Brand",
      "Vehicle",
      "OE Part Number",
      "Manufacturing Part Number",
      "Part Description",
      "Stock",
      "Unit Price in AED"
    ];

    for (let col of required) {
      if (!(col in sheet[0])) {
        return res.status(400).json({ message: `Missing column: ${col}` });
      }
    }

    priceList = sheet;

    fs.writeFileSync("price.enc", encrypt(priceList));

    lastUpdated = getUAETime();

    res.json({ message: "Price uploaded", lastUpdated });

  } catch (err) {
    console.error("UPLOAD PRICE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ================= SEARCH ================= */

app.post("/search", (req, res) => {
  try {
    const { query } = req.body;

    const result = priceList
      .filter((p) =>
        Object.values(p)
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      )
      .slice(0, 20);

    res.json(result);

  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ================= LAST UPDATED ================= */

app.get("/last-updated", (req, res) => {
  res.json({ lastUpdated });
});

/* ================= START ================= */

app.listen(process.env.PORT, () => {
  console.log("Server running on port", process.env.PORT);
});
