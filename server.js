const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");

// ✅ IMPORTANT: use /tmp for Render
const upload = multer({ dest: "/tmp/" });

/* ================= ADMIN UPLOAD USER ================= */

app.post("/admin/upload-users", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    console.log("Uploaded file path:", req.file.path);

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return res.status(400).json({ message: "No sheet found in Excel" });
    }

    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (data.length === 0) {
      return res.status(400).json({ message: "Excel is empty" });
    }

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
      if (!(col in data[0])) {
        console.log("Missing column:", col);
        return res.status(400).json({ message: `Missing column: ${col}` });
      }
    }

    users = data.map((u) => ({
      username: u["Username"],
      password: bcrypt.hashSync(String(u["Password"]), 10),
      name: u["Customer Name"],
      code: u["Customer Code"],
      email: u["Customer email ID"],
      salesman: u["Sales Man name"],
      phone: u["Salesman contact no."],
      salesEmail: u["Salesman Email ID"]
    }));

    fs.unlinkSync(req.file.path); // clean temp file

    lastUpdated = getUAETime();

    res.json({ message: "Users uploaded", lastUpdated });

  } catch (error) {
    console.error("UPLOAD USERS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

/* ================= ADMIN UPLOAD PRICE ================= */

app.post("/admin/upload-price", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    console.log("Uploaded file path:", req.file.path);

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return res.status(400).json({ message: "No sheet found" });
    }

    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (data.length === 0) {
      return res.status(400).json({ message: "Excel is empty" });
    }

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
      if (!(col in data[0])) {
        console.log("Missing column:", col);
        return res.status(400).json({ message: `Missing column: ${col}` });
      }
    }

    priceList = data;

    fs.unlinkSync(req.file.path);

    lastUpdated = getUAETime();

    res.json({ message: "Price list uploaded", lastUpdated });

  } catch (error) {
    console.error("UPLOAD PRICE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});
