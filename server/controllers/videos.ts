import express from 'express';
import { ExpressError } from '../errorHandler';
import Video, { uploadStatus } from '../models/Video';
import mongoose from 'mongoose';
import { IVideo } from '../models/Video';
import User from '../models/User';
import Comment from '../models/Comment'
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {verify_signature} from '../signing/hmac';
import { sendJobToQueue, KafkaMessage } from '../kafka/kafka';
import dotenv from 'dotenv';

dotenv.config();

const minio = new S3Client({
	region: "us-east-1",
	endpoint: "http://localhost:9000",
	forcePathStyle: true,
	credentials: {
		accessKeyId: process.env.MINIO_ACCESS_KEY!,
		secretAccessKey: process.env.MINIO_SECRET!,
	},
});



export const like = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
        // Make sure there is an active session
		if (!req.session.uid) {
			throw new ExpressError("You must be signed in to like videos!", 404);
		}

        // Get the video being liked from the DB
		const video: mongoose.Document | null = await Video.findById(req.params.videoID);

        // If the video can't be found, error
		if (!video) {
			throw new ExpressError(`Video with ID '${req.params.videoID}' not found!`, 404);
		}

        // Get all the users who liked the video
		const likes: string[] = video.get("likedUsers");

		if (!likes.includes(req.session.uid)) {
            // If the user hasn't liked this video already, add their ID to the likedUsers array and increment likes by 1
			await Video.updateOne({ _id: req.session.uid }, { $addToSet: {likedUsers: req.session.uid}, $inc: { likes: 1 } });
		}
        else{
            // If the user already liked this, remove their ID from likedUsers and decrement likes by 1
			await Video.updateOne({ _id: req.session.uid }, { $pull: {likedUsers: req.session.uid}, $inc: { likes: -1 } });
        }
		res.status(200).json();
	} catch (err) {
		next(err);
	}
}

export const dislike = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
        // Check if there is an active session
		if (!req.session.uid) {
			throw new ExpressError("You must be signed in to dislike videos!", 404);
		}

        // Fetch the video being disliked from the DB
		const video: mongoose.Document | null = await Video.findById(req.params.videoID);

        // Make sure the video exists
		if (!video) {
			throw new ExpressError(`Video with ID '${req.params.videoID}' not found!`, 404);
		}

        // Get all the dislikes for the video
		const dislikes: string[] = video.get("dislikedUsers");

		if (!dislikes.includes(req.session.uid)) {
            // If the user hasn't already disliked the video, add them to the dislikedUsers array and increment dislikes by 1
			await Video.updateOne({ _id: req.session.uid }, { $addToSet:{dislikedUsers: req.session.uid}, $inc: { dislikes: 1 }});
		}
        else{
            // If the user has already disliked the video, remove them from the dislikedUsers array and decrement dislikes by 1
			await Video.updateOne({ _id: req.session.uid }, { $pull:{dislikedUsers: req.session.uid}, $inc: { dislikes: -1 }});
        }
		res.status(200).json();
	} catch (err) {
		next(err);
	}

}

export const generateSignedURL = async (videoId: string, contentType: string) => {
	if(!videoId){
		throw new ExpressError("Invalid VideoID", 500);
	}
	const filename = `${videoId.toString()}`;
	const bucket = 'unprocessed';
	const expiry = 60 * 10; // URL valid for 10 minutes
	
	if(!contentType){
		throw new ExpressError("Invalid content type!", 500);
	}

	const command = new PutObjectCommand({
        Bucket: bucket,
        Key: filename,
        ContentType: contentType,
    });

	
    const signedUrl = await getSignedUrl(minio, command, {
        expiresIn: expiry, // 10 minutes
    });

    return { url: signedUrl, key: filename };
}

export const upload_complete = async (req: express.Request, res: express.Response, next: express.NextFunction) =>{
	const received_signature: string = req.headers['X-Signature'] as string;
	
	const valid = verify_signature((req as any).rawBody, received_signature);

	if(!valid){
		res.status(403).send('Invalid signature');
	}

	const videoId: string = (req.body.key).split('/')[1];
	console.log(videoId);

	await sendJobToQueue('video-processing-queue', {videoId: videoId, contentType: ""});

	Video.findByIdAndUpdate(videoId, {uploadStatus: uploadStatus.PROCESSING});

	res.status(200).send();


}

export const upload = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
		console.log(await minio.config.credentials())
        // Check for actuve session
		if (!req.session.uid) {
			throw new ExpressError("You must be signed in to do this!", 404);
		}

        // Make an array of legal parameters for the new video
		const legalKeys: string[] = ["videoTitle", "desc", "imgURL", "videoURL", "tags",];
        
        // Make put the params into an object
		const videoParams: IVideo = req.body;

        /// Sanitize user input so that only legal keys can be modified by the user
		Object.keys(videoParams).forEach((key: string) => {
			if (!(legalKeys.includes(key))) {
				delete videoParams[key as keyof IVideo];
			}
		});

        // Create a new video with the legal params specified by the user
		const video: mongoose.Document | null = new Video({ ...videoParams, userID: req.session.uid });

		if(!video._id){
			throw new ExpressError("ID could not be generated", 500);
		}

        // Create an object to send back to the user
		const videoObj: object = video.toObject();

        // Add the video's ID to the user's videos array
        const user: mongoose.Document|null = await User.findByIdAndUpdate(req.session.uid, {
            $addToSet: {
                videos: video._id
            }
        })
        
        // If the user can't be found, error
        if(!user){
            throw new ExpressError(`Unable to fetch user with ID: ${req.session.uid}`, 404);
        }

		const contentType = req.get("content-type");
		if(!('contentType' in video)){
			throw new ExpressError("Internal Server Error", 500);
		}
		video.contentType = contentType;
		
		const url = await generateSignedURL(video._id as string, contentType ?? "video/mp4");

		console.log(url)

		if(!('uploadStatus' in video)){
			throw new ExpressError("Internal Server Error", 500)
		}

		video.uploadStatus = uploadStatus.URL_REQUESTED;

        // Save the newly created video to the DB
		await video.save();

        // Sanatize response
		if ('__v' in videoObj) {
			delete videoObj.__v;
		}
        
        console.log(video._id as string)
        // Send response to user
		res.status(200).json({url, videoObj});

	} catch (err) {
		next(err);
	}

}

export const deleteVid = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
        // Check for an active session
		if (!req.session.uid) {
			throw new ExpressError("Must be signed in to do this!", 404);
		}

        // Get the video from the DB
		const video: mongoose.Document | null = await Video.findById(req.params.videoID);

        // Make an object to return to the user
		const videoObj: object = video?.toObject();

        // If the video can't be found, error
		if (!video || !videoObj) {
			throw new ExpressError(`Can't find video with ID ${req.params.videoID}`, 404);
		}

        // Make sure only the owner of the video can delete the video
		if (req.session.uid != video.get("userID")) {
			throw new ExpressError("You can only delete your own videos!", 404);
		}

        // Remove all commments associated with the video from the DB
        await Comment.deleteMany({_id: {$in:video.get("comments")}});
        
        // Remove video ID from user's videos array
        await User.findByIdAndUpdate(req.session.uid, {$pull: {videos: video.get("_id")}});

        // Remove the video from the DB
		await Video.deleteOne({ _id: req.params.videoID });

        // Define legal keys to send back to the user
		const legalKeys: string[] = ["userID", "videoTitle", "videoURL", "tags", "views", "likes", "dislikes"];
        
        // Sanitize return object
		Object.keys(videoObj).forEach((key: string) => {
			if (!legalKeys.includes(key)) {
				delete videoObj[key as keyof object];
			}
		})

        // Respond to the request
		res.status(200).json(videoObj);
	} catch (err) {
		next(err);
	}

}

export const addView = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
	try {
        // Check for active session
		if (!req.params.videoID) {
			throw new ExpressError("Invalid video ID!", 404);
		}

        // Get the video from the DB and increment views
		const video: mongoose.Document | null = await Video.findOneAndUpdate({ _id: req.params.videoID }, { $inc: { views: 1 } });

        // If the video can't be found, error
		if (!video) {
			throw new ExpressError(`Can't find video with ID ${req.params.videoID}`, 404);
		}
        
        // Make the response object
		const videoObj: object = video.toObject();

        // Make sure it isn't null, if it is then error
		if (!videoObj) {
			throw new ExpressError("An unknown error occurred!", 500);
		}

        // Define legal keys to include in response
		const legalKeys: string[] = ["userID", "videoTitle", "videoURL", "tags", "views", "likes", "dislikes", "comments"];

        // Sanitize response object
		Object.keys(videoObj).forEach((key: string) => {
			if (!legalKeys.includes(key)) {
				delete videoObj[key as keyof object];
			}
		})

        //Respond to the request
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

        // Respond to request
		res.status(200).json(randVids);
	} catch (err) {
		next(err);
	}
}

export const updateVideo = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        // Check for actuve session
        if(!req.session.uid){
            throw new ExpressError("You must be signed in to do this!", 404);
        }

        //Define legal keys to update (user cant update _id, __v, etc.)
        const legalKeys: string[] = ["videoTitle", "desc", "imgURL", "videoURL", "tags"];

        // Make an object with the request body to sanitize update params
        const updateParams: object = {...req.body};

        // Sanitize request body
        Object.keys(updateParams).forEach((key: string)=>{
            if(!(legalKeys.includes(key))){
                delete updateParams[key as keyof object];
            }
        });
        
        // Get the video from the DB and update it with new params
        const video: mongoose.Document|null = await Video.findByIdAndUpdate(req.params.videoID, updateParams);

        // Check to make sure the video actually got updated
        if(!video){
            throw new ExpressError(`Unable to find video with ID: ${req.params.videoID}`, 404);
        }

        // Make the response object
        const videoObj: object = video.toObject();

        // Specify illegal Keys that we don't want in the response
        const illegalKeys: string[] = ["__v", "likedUsers", "dislikedUsers", "comments"];

        // Sanitizze response
        Object.keys(videoObj).forEach((key: string)=>{
            if(illegalKeys.includes(key)){
                delete videoObj[key as keyof object];
            }
        })

        // Respond to request
        res.status(200).json(videoObj);
    } catch(err){
        next(err);
    }
}

export const test = (req: express.Request, res: express.Response, next: express.NextFunction) =>{
	try{
		if(!req.params.id){
			throw new ExpressError('Error!');
		}
		
	} catch(err){
		next(err);
	}
	res.status(200).json("complete");
}