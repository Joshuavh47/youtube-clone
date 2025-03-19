import express from 'express';
import mongoose from 'mongoose';
import { ExpressError } from '../errorHandler';
import User from '../models/User'
import Comment from '../models/Comment'

export const addComment = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
       if(!req.session.uid){
            throw new ExpressError("You must be singned in to do this", 404);
        } 
        const comment: mongoose.Document = new Comment({userID: req.session.uid, videoID: req.params.videoID, desc: req.body['desc']??""});
        await comment.save();
        await User.findByIdAndUpdate(req.session.uid, {$addToSet: {comments: comment.get("_id")}});
    } catch(err){
        next(err);
    }
}


