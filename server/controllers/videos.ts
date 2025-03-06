import express from 'express';
import { ExpressError } from '../errorHandler';
import Video from '../models/Video';
import mongoose from 'mongoose';
import { IVideo } from '../models/Video';

export const like = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.session.uid){
            throw new ExpressError("You must be signed in to like videos!", 404);
        }
        if(!req.params.videoID){
            throw new ExpressError("You must specify a video ID!", 404);
        }
        const video: mongoose.Document|null = await Video.findById(req.params.videoID);
        if(!video){
            throw new ExpressError(`Video with ID \'${req.params.videoID}\' not found!`, 404);
        }
        const likes: string[] = video.get("likedUsers");
        if(!likes.includes(req.session.uid)){
            likes.push(req.session.uid);
            await Video.updateOne({_id: req.session.uid}, {likedUsers: likes, $inc:{likes: 1}});
        }
        res.status(200).json();
    } catch(err){
        next(err);
    }
}

export const dislike = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.session.uid){
            throw new ExpressError("You must be signed in to dislike videos!", 404);
        }
        if(!req.params.videoID){
            throw new ExpressError("You must specify a video ID!", 404);
        }
        const video: mongoose.Document|null = await Video.findById(req.params.videoID);
        if(!video){
            throw new ExpressError(`Video with ID \'${req.params.videoID}\' not found!`, 404);
        }
        const dislikes: string[] = video.get("dislikedUsers");
        if(!dislikes.includes(req.session.uid)){
            dislikes.push(req.session.uid);
            await Video.updateOne({_id: req.session.uid}, {dislikedUsers: dislikes, $inc:{dislikes: 1}});
        }
        res.status(200).json();
    } catch(err){
        next(err);
    }

}

export const upload = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.session.uid){
            throw new ExpressError("You must be signed in to do this!", 404);
        }
        const legalKeys: string[] = ["videoTitle", "desc", "imgURL", "videoURL", "tags",];
        
        const videoParams: IVideo = req.body;

        Object.keys(videoParams).forEach((key:string)=>{
            if(!(legalKeys.includes(key))){
                delete videoParams[key as keyof IVideo];
            }
        });
        const video: mongoose.Document|null = new Video({...videoParams, userID: req.session.uid});
        const videoObj: object = video.toObject();
        await video.save();
        if('__v' in videoObj){
            delete videoObj.__v;
        }
        res.status(200).json(videoObj);

    } catch(err){
        next(err);
    }

}

export const deleteVid = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.session.uid){
            throw new ExpressError("Must be signed in to do this!", 404);
        }
        const video: mongoose.Document|null = await Video.findById(req.params.videoID);
        const videoObj:object = video?.toObject();
        if(!video || !videoObj){
            throw new ExpressError(`Can't find video with ID ${req.params.videoID}`, 404);
        }
        if(req.session.uid != video.get("userID")){
            throw new ExpressError("You can only delete your own videos!", 404);
        }
        await Video.deleteOne({_id: req.params.videoID});
        const legalKeys: string[] = ["userID", "videoTitle", "videoURL", "tags", "views", "likes", "dislikes"];
        Object.keys(videoObj).forEach((key:string)=>{
            if(!legalKeys.includes(key)){
                delete videoObj[key as keyof object];
            }
        })
        res.status(200).json(videoObj);
    } catch(err){
        next(err);
    }

}

export const addView = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.params.videoID){
            throw new ExpressError("Invalid video ID!", 404);
        }
        const video: mongoose.Document|null = await Video.findOneAndUpdate({_id: req.params.videoID}, {$inc: {views:1}});
        if(!video){
            throw new ExpressError(`Can't find video with ID ${req.params.videoID}`, 404);
        }
    } catch(err){
        next(err)
    }
}