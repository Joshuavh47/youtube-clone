import express from "express"
import { addComment, deleteComment, updateComment } from "../controllers/comments";
import { verifySession } from "../controllers/auth";
//import {  } from "../controllers/comments"

const router = express.Router();

router.put("/add", verifySession, addComment);

router.delete("/delete/:id", verifySession, deleteComment);

router.put("/update/:id", verifySession, updateComment);

export default router;
