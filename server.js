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
app.use(cors());
app.use(express.json());

/* ================= STORAGE ================= */

const upload = multer({ dest: "/tmp/" });

let users = [];
let priceList = [];
let lastUpdated = null;

/* ================= HELPERS ================= */

function encrypt(data) {
  return CryptoJS.AES.encrypt(
    JSON.stringify(data),
    process.env.ENCRYPTION_KEY
  ).toString();
}

function decrypt(data) {
  const bytes = CryptoJS.AES.decrypt(data, process.env.ENCRYPTION_KEY);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

function getUAETime() {
  return moment().tz("Asia/Dubai").format("DD MMM YYYY, hh:mm A");
}

/* ================= ADMIN UPLOAD USER ================= */

app.post("/admin/upload-users", upload.single("file"), (req, res) => {
  const file = XLSX.readFile(req.file.path);
  const sheet = XLSX.utils.sheet_to_json(file.Sheets[file.SheetNames[0]]);

  // VALIDATE
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
    if (!sheet[0][col]) {
      return res.status(400).json({ message: `Missing column: ${col}` });
    }
  }

  users = sheet.map((u) => ({
    username: u["Username"],
    password: bcrypt.hashSync(u["Password"], 10),
    name: u["Customer Name"],
    code: u["Customer Code"],
    email: u["Customer email ID"],
    salesman: u["Sales Man name"],
    phone: u["Salesman contact no."],
    salesEmail: u["Salesman Email ID"]
  }));

  const encrypted = encrypt(users);
  fs.writeFileSync("users.enc", encrypted);

  lastUpdated = getUAETime();

  res.json({ message: "Users uploaded", lastUpdated });
});

/* ================= ADMIN UPLOAD PRICE ================= */

app.post("/admin/upload-price", upload.single("file"), (req, res) => {
  const file = XLSX.readFile(req.file.path);
  const sheet = XLSX.utils.sheet_to_json(file.Sheets[file.SheetNames[0]]);

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
    if (!sheet[0][col]) {
      return res.status(400).json({ message: `Missing column: ${col}` });
    }
  }

  priceList = sheet;

  const encrypted = encrypt(priceList);
  fs.writeFileSync("price.enc", encrypted);

  lastUpdated = getUAETime();

  res.json({ message: "Price list uploaded", lastUpdated });
});

/* ================= SEARCH ================= */

app.post("/search", (req, res) => {
  const { query } = req.body;

  const result = priceList.filter((p) =>
    Object.values(p)
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase())
  ).slice(0, 20);

  res.json(result);
});

/* ================= LAST UPDATED ================= */

app.get("/last-updated", (req, res) => {
  res.json({ lastUpdated });
});

/* ================= START ================= */

app.listen(process.env.PORT, () => {
  console.log("Server running on port", process.env.PORT);
});
