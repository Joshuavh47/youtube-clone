import express from "express"
import { signup, signin, signout, test } from "../controllers/auth"

const router = express.Router();

// CREATE A USER
router.post("/signup", signup);

// SIGN IN
router.post("/signin", signin);

// SIGN OUT
router.post("/signout", signout)

// GOOGLE SIGN IN


router.post("/test", test)

export default router;