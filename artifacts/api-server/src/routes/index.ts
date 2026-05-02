import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import calendarRouter from "./calendar";
import bookingsRouter from "./bookings";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(calendarRouter);
router.use(bookingsRouter);
router.use(historyRouter);

export default router;
