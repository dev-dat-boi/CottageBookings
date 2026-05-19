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

// Catch-all: return index.html for any non-API route so React Router works.
// Must come AFTER the /api router.
if (frontendDist) {
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
