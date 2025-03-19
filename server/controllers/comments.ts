import express from 'express';
import mongoose from 'mongoose';
import { ExpressError } from '../errorHandler';
import User from '../models/User'
import Comment from '../models/Comment'
import Video from '../models/Video'

export const addComment = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        // Check if there is a session
       if(!req.session.uid){
            throw new ExpressError("You must be singned in to do this", 404);
        }

        // Make a new comment with the necessary params
        const comment: mongoose.Document = new Comment({userID: req.session.uid, videoID: req.params.videoID, desc: req.body['desc']??""});

        // Save to DB
        await comment.save();

        // Put the comment ID into the video's comments array if it isn't already
        const video: mongoose.Document|null = await Video.findByIdAndUpdate(req.params.videoID, {$addToSet: {comments: comment.get("_id")}});

        // Make sure these aren't null (if they are, the comments array wouldn't be updated)
        if(!video){
            throw new ExpressError(`Unable to find video with ID: ${req.params.videoID}`, 404);
        }

        // Send back info about newly created comment
        res.status(200).json({id: comment.get("_id"), userID: comment.get("userID"), videoID: comment.get("videoID"), desc: comment.get("desc")})
    } catch(err){
        next(err);
    }
}

export const deleteComment = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        // Check for an active session
        if(!req.session.uid){
            throw new ExpressError("Unable to fetch user!", 404);
        }

        // Get the comment that is being deleted
        const comment: mongoose.Document|null = await Comment.findById(req.params.id);

        // If it doesn't exist throw an error
        if(!comment){
            throw new ExpressError(`Unable to find comment with ID: ${req.params.id}`, 404);
        }

        // Find the video associated with the comment
        const video: mongoose.Document|null = await Video.findById(comment.get("videoID"));

        // If it can't be found, error
        if(!video){
            throw new ExpressError(`Unable to find video with ID: ${comment.get("videoID")}`, 404);
        }

        // If the person making this request isn't the owner of the comment or the owner of the video, error
        if(!(req.session.uid != comment.get("userID") || req.session.uid != video.get("userID"))){
            throw new ExpressError("You must own this comment or video to delete!", 403);
        }

        // Remove comment ID from the video's comments array
        await Video.updateOne({_id: comment.get("videoID")}, {$pull: {comments: comment.get("_id")}});

        // Remove the comment from the DB
        await Comment.deleteOne({_id: comment.get("_id")});

        // Sanitize object returned to user
        const commentObj: object = comment.toObject();
        if("__v" in commentObj){
            delete commentObj.__v;
        }
        
        // Response to user
        res.status(200).json(commentObj)
    } catch(err){
       next(err); 
    }
}

export const updateComment = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        // Make sure there is an active session
        if(!req.session.uid){
            throw new ExpressError("You must be signed in to do this!", 403);
        }

        // Make sure there the comment's message isn't null
        if(!req.body["desc"]){
            throw new ExpressError("The comment body must not be null!");
        }

        // Get comment from DB
        const comment: mongoose.Document|null = await Comment.findById(req.params.id);

        // If the comment can't be found, error
        if(!comment){
            throw new ExpressError(`Unable to find a comment with ID: ${req.params.id}`, 404);
        }

        // Make sure the comment is being edited by its owner
        if(comment.get("userID") != req.session.uid){
            throw new ExpressError("Only the owner of this comment can edit it!", 403);
        }

        // Update the comment's message and set edited to true
        await Comment.updateOne({_id: req.session.uid}, {desc: req.body["desc"], edited: true});

        // Send info about the newly updated comment back to the user
        res.status(200).json({userID: req.session.uid, videoID: comment.get("videoID"), desc: req.body["desc"], edited: true});
    } catch(err){
        next(err);
    }
}


