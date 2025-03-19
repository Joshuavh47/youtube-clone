import express from 'express';
import mongoose from 'mongoose';
import { ExpressError } from '../errorHandler';
import User from '../models/User'
import Comment from '../models/Comment'
import Video from '../models/Video'

export const addComment = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
       if(!req.session.uid){
            throw new ExpressError("You must be singned in to do this", 404);
        } 
        const comment: mongoose.Document = new Comment({userID: req.session.uid, videoID: req.params.videoID, desc: req.body['desc']??""});
        await comment.save();
        const user: mongoose.Document|null = await User.findByIdAndUpdate(req.session.uid, {$addToSet: {comments: comment.get("_id")}});
        const video: mongoose.Document|null = await Video.findByIdAndUpdate(req.params.videoID, {$addToSet: {comments: comment.get("_id")}});
        if(!user){
            throw new ExpressError(`Unable to find user with ID: ${req.session.uid}`);
        }
        if(!video){
            throw new ExpressError(`Unable to find video with ID: ${req.params.videoID}`, 404);
        }
        res.status(200).json({id: comment.get("_id"),userID: comment.get("userID"), videoID: comment.get("videoID"), desc: comment.get("desc")})
    } catch(err){
        next(err);
    }
}

export const deleteComment = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.session.uid){
            throw new ExpressError("Unable to fetch user!", 404);
        }
        const comment: mongoose.Document|null = await Comment.findById(req.params.id);
        if(!comment){
            throw new ExpressError(`Unable to find comment with ID: ${req.params.id}`, 404);
        }
        const video: mongoose.Document|null = await Video.findById(comment.get("videoID"));
        if(!video){
            throw new ExpressError(`Unable to find video with ID: ${comment.get("videoID")}`, 404);
        }
        if(!(req.session.uid !=comment.get("userID") || req.session.uid != video.get("userID"))){
            throw new ExpressError("You must own this comment or video to delete!", 403);
        }
        const user: mongoose.Document|null = await User.findByIdAndUpdate(comment.get("userID"), {$pull: {comments: comment.get("_id")}});
        if(!user){
            throw new ExpressError(`Unable to find user with ID: ${req.session.uid}`, 404);
        }
        await Video.updateOne({_id: comment.get("videoID")}, {$pull: {comments: comment.get("_id")}});
        await Comment.deleteOne({_id: comment.get("_id")});
        const commentObj: object = comment.toObject();
        if("__v" in commentObj){
            delete commentObj.__v;
        }

        res.status(200).json(commentObj)
    } catch(err){
       next(err); 
    }
}

export const updateComment = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.session.uid){
            throw new ExpressError("You must be signed in to do this!", 403);
        }
        if(!req.body["desc"]){
            throw new ExpressError("The comment body must not be null!");
        }
        const comment: mongoose.Document|null = await Comment.findById(req.params.id);
        if(!comment){
            throw new ExpressError(`Unable to find a comment with ID: ${req.params.id}`, 404);
        }
        if(comment.get("userID") != req.session.uid){
            throw new ExpressError("Only the owner of this comment can edit it!", 403);
        }
        await Comment.updateOne({_id: req.session.uid}, {desc: req.body["desc"], edited: true});
        res.status(200).json({userID: req.session.uid, videoID: comment.get("videoID"), desc: req.body["desc"], edited: true});
    } catch(err){
        next(err);
    }
}


