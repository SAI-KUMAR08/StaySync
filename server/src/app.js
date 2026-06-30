import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import { errorHandler } from "./middleware/error.middleware.js";
import routes from "./routes/index.js";
import { corsOriginDelegate } from "./utils/corsOrigins.js";

const app = express();

// Render / reverse proxies (required for correct IPs + secure cookies)
app.set("trust proxy", 1);

// CORS Whitelist Configuration
const corsOptions = {
  origin: corsOriginDelegate,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["X-Access-Token", "X-Refresh-Token", "Set-Cookie"],
  maxAge: 86400, // 24h — cache preflight
};

// 1. CORS (global middleware — handles preflight automatically)
app.use(cors(corsOptions));

// 2. Helmet
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// 3. Compression
app.use(compression());

// HTTP Logger
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// 4. Express Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Cookie Parser
app.use(cookieParser());
app.use(mongoSanitize());

// Root Endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "MyHostel API",
    health: "/api/health",
  });
});

// 6. Routes
app.use("/api", routes);

// 7. Error Middleware
app.use(errorHandler);

export default app;
