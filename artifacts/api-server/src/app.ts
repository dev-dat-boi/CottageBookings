import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "75mb" }));
app.use(express.urlencoded({ extended: true, limit: "75mb" }));

// In production (Railway), serve the compiled React frontend as static files
// before the API router so assets are found efficiently.
const frontendDist =
  process.env.NODE_ENV === "production"
    ? path.resolve(process.cwd(), "artifacts/cottage-pricing/dist/public")
    : null;

if (frontendDist) {
  app.use(express.static(frontendDist));
}

app.use("/api", router);

if (frontendDist) {
  const fd = frontendDist;
  // Single catch-all after all API routes:
  //   /api/*  → JSON 404 (never falls through to the SPA)
  //   GET /*  → index.html (React Router handles client-side navigation)
  //   other   → 404 (Express default)
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "Not found" });
    } else if (req.method === "GET") {
      res.sendFile(path.join(fd, "index.html"));
    } else {
      next();
    }
  });
}

export default app;
