import express from "express"
import { like, dislike, upload, deleteVid, addView, getSubscribedVideos, updateVideo, test, upload_complete } from '../controllers/videos'
import { verifySession } from "../controllers/auth";

const router = express.Router();

router.put("/like/:videoID", verifySession, like);

router.put("/dislike/:videoID", verifySession, dislike);

router.post("/upload/", verifySession, upload);

router.post("/upload-complete", upload_complete);

router.delete("/delete/:videoID", verifySession, deleteVid);

router.put("/addView/:videoID", addView);

router.get("/subscribed/", getSubscribedVideos);

router.put("/update/:videoID", verifySession, updateVideo);

router.post("/test/:id", test);

export default router;
