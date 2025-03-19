import express from 'express';
import { ExpressError } from '../errorHandler';
import Video from '../models/Video';
import mongoose from 'mongoose';
import { IVideo } from '../models/Video';
import User from '../models/User';
import Comment from '../models/Comment'

export const like = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
		if (!req.session.uid) {
			throw new ExpressError("You must be signed in to like videos!", 404);
		}
		if (!req.params.videoID) {
			throw new ExpressError("You must specify a video ID!", 404);
		}
		const video: mongoose.Document | null = await Video.findById(req.params.videoID);
		if (!video) {
			throw new ExpressError(`Video with ID '${req.params.videoID}' not found!`, 404);
		}
		const likes: string[] = video.get("likedUsers");
		if (!likes.includes(req.session.uid)) {
			likes.push(req.session.uid);
			await Video.updateOne({ _id: req.session.uid }, { likedUsers: likes, $inc: { likes: 1 } });
		}
		res.status(200).json();
	} catch (err) {
		next(err);
	}
}

export const dislike = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
		if (!req.session.uid) {
			throw new ExpressError("You must be signed in to dislike videos!", 404);
		}
		if (!req.params.videoID) {
			throw new ExpressError("You must specify a video ID!", 404);
		}
		const video: mongoose.Document | null = await Video.findById(req.params.videoID);
		if (!video) {
			throw new ExpressError(`Video with ID '${req.params.videoID}' not found!`, 404);
		}
		const dislikes: string[] = video.get("dislikedUsers");
		if (!dislikes.includes(req.session.uid)) {
			dislikes.push(req.session.uid);
			await Video.updateOne({ _id: req.session.uid }, { dislikedUsers: dislikes, $inc: { dislikes: 1 } });
		}
		res.status(200).json();
	} catch (err) {
		next(err);
	}

}

export const upload = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
		if (!req.session.uid) {
			throw new ExpressError("You must be signed in to do this!", 404);
		}
		const legalKeys: string[] = ["videoTitle", "desc", "imgURL", "videoURL", "tags",];

		const videoParams: IVideo = req.body;

		Object.keys(videoParams).forEach((key: string) => {
			if (!(legalKeys.includes(key))) {
				delete videoParams[key as keyof IVideo];
			}
		});
		const video: mongoose.Document | null = new Video({ ...videoParams, userID: req.session.uid });
		const videoObj: object = video.toObject();
		await video.save();
        const user: mongoose.Document|null = await User.findByIdAndUpdate(req.session.uid, {
            $addToSet: {
                videos: video._id
            }
        })

		if ('__v' in videoObj) {
			delete videoObj.__v;
		}
		res.status(200).json(videoObj);

	} catch (err) {
		next(err);
	}

}

export const deleteVid = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
		if (!req.session.uid) {
			throw new ExpressError("Must be signed in to do this!", 404);
		}
		const video: mongoose.Document | null = await Video.findById(req.params.videoID);
		const videoObj: object = video?.toObject();
		if (!video || !videoObj) {
			throw new ExpressError(`Can't find video with ID ${req.params.videoID}`, 404);
		}
		if (req.session.uid != video.get("userID")) {
			throw new ExpressError("You can only delete your own videos!", 404);
		}
        await Comment.deleteMany({_id: {$in:video.get("comments")}});
        await User.findByIdAndUpdate(req.session.uid, {$pull: {videos: video.get("_id")}});
		await Video.deleteOne({ _id: req.params.videoID });
		const legalKeys: string[] = ["userID", "videoTitle", "videoURL", "tags", "views", "likes", "dislikes"];
		Object.keys(videoObj).forEach((key: string) => {
			if (!legalKeys.includes(key)) {
				delete videoObj[key as keyof object];
			}
		})
		res.status(200).json(videoObj);
	} catch (err) {
		next(err);
	}

}

export const addView = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
		if (!req.params.videoID) {
			throw new ExpressError("Invalid video ID!", 404);
		}
		const video: mongoose.Document | null = await Video.findOneAndUpdate({ _id: req.params.videoID }, { $inc: { views: 1 } });
		if (!video) {
			throw new ExpressError(`Can't find video with ID ${req.params.videoID}`, 404);
		}
		const videoObj: object = video.toObject();
		if (!videoObj) {
			throw new ExpressError("An unknown error occurred!", 500);
		}
		const legalKeys: string[] = ["userID", "videoTitle", "videoURL", "tags", "views", "likes", "dislikes"];
		Object.keys(videoObj).forEach((key: string) => {
			if (!legalKeys.includes(key)) {
				delete videoObj[key as keyof object];
			}
		})

		res.status(200).json(videoObj);
	} catch (err) {
		next(err)
	}
}

export const getSubscribedVideos = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
		// Make sure there is a session
		if (!req.session.uid) {
			throw new ExpressError("You must be signed in to get subscribed videos!", 404);
		}

		// Get the user's info
		const user: mongoose.Document | null = await User.findById(req.session.uid);

		// If there is a problem, throw an error
		if (!user) {
			throw new ExpressError("Internal Server Error!", 404);
		}

		// Get all the subscribed users from the current user
		const subscribedChannels: string[] = user.get("subscribedUsers");

		// Throw an error if we can't
		if (!subscribedChannels) {
			throw new ExpressError("Could not get subscribed channels. Reload or re-signin.", 404);
		}

		// Get 20 random videos from channels in subscribedChannels
		const randVids = await Video.aggregate([
			{
				$match: {
					userID: {
						$in: subscribedChannels
					}
				},
			}, {
				$sample: { size: 20 }
			}
		]);

		/* 
		* Remove verbose info and liked/disiked users.
		* If there are a lot of likes/dislikes on a video, these arrays could lead to a large response.
		* This endpoint should only really be called on the homepage, so this information wouldn't be needed anyways.
		*/
		const illegalKeys: string[] = ["__v", "likedUsers", "dislikedUsers", "comments"];

		// For each video, go through all the keys. Remove unneccessary ones. 
		randVids.forEach((vid: mongoose.Document) => {
			Object.keys(vid).forEach((key: string) => {
				if (illegalKeys.includes(key)) {
					delete vid[key as keyof object];
				}
			});
		});

		res.status(200).json(randVids);
	} catch (err) {
		next(err);
	}
}

export const updateVideo = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.session.uid){
            throw new ExpressError("You must be signed in to do this!", 404);
        }
        const legalKeys: string[] = ["videoTitle", "desc", "imgURL", "videoURL", "tags"];
        const updateParams: object = {...req.body};
        Object.keys(updateParams).forEach((key: string)=>{
            if(!(legalKeys.includes(key))){
                delete updateParams[key as keyof object];
            }
        });

        const video: mongoose.Document|null = await Video.findByIdAndUpdate(req.params.videoID, updateParams);
        if(!video){
            throw new ExpressError(`Unable to find video with ID: ${req.params.videoID}`, 404);
        }
        const videoObj: object = video.toObject();
        const illegalKeys: string[] = ["__v", "likedUsers", "dislikedUsers", "comments"];
        Object.keys(videoObj).forEach((key: string)=>{
            if(illegalKeys.includes(key)){
                delete videoObj[key as keyof object];
            }
        })
        res.status(200).json(videoObj);
    } catch(err){
        next(err);
    }
}
