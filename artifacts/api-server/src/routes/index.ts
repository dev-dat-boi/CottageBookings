import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import calendarRouter from "./calendar";
import bookingsRouter from "./bookings";
import historyRouter from "./history";
import rentalsRouter from "./rentals";
import authRouter from "./auth";
import cottageRouter from "./cottage";
import emailTemplatesRouter from "./emailTemplates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(cottageRouter);
router.use(settingsRouter);
router.use(calendarRouter);
router.use(bookingsRouter);
router.use(historyRouter);
router.use(rentalsRouter);
router.use(emailTemplatesRouter);

export default router;
