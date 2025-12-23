import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import 'dotenv/config'

import candidateRoutes from "./routes/candidateRoutes.js";
import chatbotRoutes from "./routes/chatbotRoutes.js";
import workflowRoutes from "./routes/workflowRoutes.js";

import { startAutoReplyLoop } from "./services/gmailService.js";
import { initDocumentReminderCron } from "./services/cronService.js";

// --------------------------------------------------
// 1. Load Environment Variables
// --------------------------------------------------
dotenv.config();

// --------------------------------------------------
// 2. Global Error Guards (DO NOT EXIT ON PROMISE)
// --------------------------------------------------
process.on("uncaughtException", (error) => {
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.error("!!! UNCAUGHT EXCEPTION! App will exit! !!!");
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.error(error.stack || error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.error("!!! UNHANDLED PROMISE REJECTION (IGNORED) !!!");
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.error(reason?.stack || reason);
  // ❌ DO NOT EXIT — background service failure should not kill API
});

// --------------------------------------------------
// 3. Express Init
// --------------------------------------------------
const app = express();
const PORT = process.env.PORT || 4000;

// --------------------------------------------------
// 4. Middlewares
// --------------------------------------------------
app.use(cors());
app.use(express.json());

// --------------------------------------------------
// 5. Request Logger
// --------------------------------------------------
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${Date.now() - start}ms)`
    );
  });
  next();
});

// --------------------------------------------------
// 6. Routes
// --------------------------------------------------
app.use("/api/candidates", candidateRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/workflow", workflowRoutes);

app.get("/", (_, res) => {
  res.send("✅ Onboarding API is running");
});

// --------------------------------------------------
// 7. Central Error Handler
// --------------------------------------------------
app.use((err, req, res, next) => {
  console.error("🔥 CENTRAL ERROR HANDLER:", err.stack || err);
  res.status(500).json({
    error: "Internal Server Error",
    message: "Check server logs for details"
  });
});

// --------------------------------------------------
// 8. Safe Background Startup
// --------------------------------------------------
async function startBackgroundServices() {
  console.log("🔧 Initializing background services...");

  try {
    console.log("📬 Starting Gmail auto-reply service...");
    await startAutoReplyLoop();
    console.log("✅ Gmail service started");
  } catch (err) {
    console.error("❌ Gmail service failed to start");
    console.error(err.message);
  }

  try {
    console.log("⏰ Starting document reminder cron...");
    initDocumentReminderCron();
    console.log("✅ Cron service started");
  } catch (err) {
    console.error("❌ Cron service failed to start");
    console.error(err.message);
  }
}

// --------------------------------------------------
// 9. Start Server
// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
  startBackgroundServices(); // SAFE START
});
