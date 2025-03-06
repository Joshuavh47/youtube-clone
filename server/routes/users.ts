import express from "express";
import { updateUser, deleteUser, getUser, subscribe, unsubscribe, getSubscribers } from '../controllers/users';
import { verifySession } from "../controllers/auth";

const router = express.Router();

router.post("/", verifySession, updateUser);

router.delete("/", verifySession, deleteUser);

router.get("/:id?", getUser);

router.put("/subscribe/:id", verifySession, subscribe);

router.put("/unsubscribe/:id", verifySession, unsubscribe);

router.get("/subscribers/:id", getSubscribers)


export default router;