import express from "express"
import { like, dislike, upload, deleteVid, addView, getSubscribedVideos } from '../controllers/videos'
import { verifySession } from "../controllers/auth";

const router = express.Router();

router.put("/like/:videoID", verifySession, like);

router.put("/dislike/:videoID", verifySession, dislike);

router.post("/upload/", verifySession, upload);

router.delete("/delete/:videoID", verifySession, deleteVid);

router.put("/addView/:videoID", addView);

router.get("/subscribed/", getSubscribedVideos);

export default router;