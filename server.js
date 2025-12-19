const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== CONFIG ===== */
const REWARD_5MIN = 0.00001;
const REWARD_DAILY = 0.0001;

const COOLDOWN_5MIN = 5 * 60 * 1000;
const COOLDOWN_DAILY = 24 * 60 * 60 * 1000;

const FAUCETPAY_API = "bc6b2291feb99d430e8f84d00f48de44930ddefaa13c4b92ab73696850286fe8";
const COIN = "BTC"; // cambia si usas otra moneda

/* ===== MIDDLEWARE ===== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  name: "faucet_session",
  secret: "SUPER_FAUCET_SECRET",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));

app.use(express.static(path.join(__dirname, "public")));

/* ===== DATA ===== */
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ===== ROOT ===== */
app.get("/", (req, res) => {
  if (!req.session.email) {
    return res.sendFile(path.join(__dirname, "public/login.html"));
  }
  res.sendFile(path.join(__dirname, "public/faucet.html"));
});

/* ===== LOGIN ===== */
app.post("/login", (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false });

  req.session.email = email;

  const data = loadData();
  if (!data.users[email]) {
    data.users[email] = {
      balance: 0,
      last5: 0,
      lastDaily: 0
    };
    saveData(data);
  }

  res.json({ success: true });
});

/* ===== LOGOUT ===== */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("faucet_session");
    res.redirect("/");
  });
});

/* ===== STATUS ===== */
app.get("/status", (req, res) => {
  if (!req.session.email) return res.json({ logged: false });

  const data = loadData();
  const user = data.users[req.session.email];

  res.json({
    logged: true,
    balance: user.balance,
    last5: user.last5,
    lastDaily: user.lastDaily
  });
});

/* ===== CLAIM 5 MIN ===== */
app.post("/claim/5min", (req, res) => {
  if (!req.session.email) return res.json({ success: false });

  const data = loadData();
  const user = data.users[req.session.email];
  const now = Date.now();

  if (now - user.last5 < COOLDOWN_5MIN) {
    return res.json({ success: false, error: "Cooldown activo" });
  }

  user.balance += REWARD_5MIN;
  user.last5 = now;
  saveData(data);

  res.json({ success: true });
});

/* ===== CLAIM DAILY ===== */
app.post("/claim/daily", (req, res) => {
  if (!req.session.email) return res.json({ success: false });

  const data = loadData();
  const user = data.users[req.session.email];
  const now = Date.now();

  if (now - user.lastDaily < COOLDOWN_DAILY) {
    return res.json({ success: false, error: "Ya reclamado hoy" });
  }

  user.balance += REWARD_DAILY;
  user.lastDaily = now;
  saveData(data);

  res.json({ success: true });
});

/* ===== WITHDRAW FAUCETPAY ===== */
app.post("/withdraw", async (req, res) => {
  if (!req.session.email) return res.json({ success: false });

  const { address } = req.body;
  if (!address) return res.json({ success: false, error: "Wallet requerida" });

  const data = loadData();
  const user = data.users[req.session.email];

  if (user.balance <= 0) {
    return res.json({ success: false, error: "Balance insuficiente" });
  }

  try {
    const response = await fetch("https://faucetpay.io/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: FAUCETPAY_API,
        to: address,
        amount: user.balance,
        currency: COIN
      })
    });

    const result = await response.json();

    if (result.status !== 200) {
      return res.json({ success: false, error: "Error FaucetPay" });
    }

    user.balance = 0;
    saveData(data);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: "Servidor FaucetPay" });
  }
});

/* ===== START ===== */
app.listen(PORT, () => {
  console.log("✅ Faucet activo");
});