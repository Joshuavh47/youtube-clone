import express from "express"
import { addComment } from "../controllers/comments";
//import {  } from "../controllers/comments"

const router = express.Router();

router.put("/add/", addComment);

export default router;
