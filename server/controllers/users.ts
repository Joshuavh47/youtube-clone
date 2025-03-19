import express from 'express';
import mongoose from 'mongoose';
import User, { sanitizeUser } from '../models/User';
import { ExpressError } from '../errorHandler';
import argon2 from 'argon2';
import Video from '../models/Video';

export const updateUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        // Get user from mongo
        const user: mongoose.Document|null = await User.findById(req.session.uid);
        // Make it an object to descructure it
        const userObj: object|undefined = await user?.toObject();
        // Make sure the user was found
        if(!user || user === undefined || !userObj || user === undefined){
            throw new ExpressError("test");
        }
        

        // Make an object of legal properties to change
        const {_id: string, createdAt, updatedAt, __v, ...legal} = user.toObject();
        
        // If there are any other properties included in a request then error
        // If there is an empty string for a field, delete this from legal object so it isnt included in the update
        // Otherwise add it to the new params object
        (Object.keys(req.body)).forEach((key: string)=>{
            if(!(key in legal)){
                throw new ExpressError("Illegal parameters!", 500);
            }
            else if((key in legal) && req.body[key] === ""){ // Remove all unused options
                delete legal[key];
            }
            else{
                legal[key] = req.body[key];
            }
        })
        
        // If changing password, hash it first
        if('password' in legal){
            legal['password'] = await argon2.hash(req.body['password']);
        }
        
        console.log(legal)
        // Update user with new parameters
        await User.updateOne({_id: req.session.uid}, legal);

        // Remove verbose/sensitive user information from response object
        const out: object|undefined = sanitizeUser(req, res, next, userObj)

        // Put changed user information back in response object
        Object.keys(legal).forEach((key:string)=>{
            if(key in userObj){
                userObj[key as keyof Object] = legal[key];
            }
        })

        res.status(200).json(out)
    } catch (err) {
        next(err);
    }
    
    
}

export const deleteUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.session.uid){
            throw new ExpressError("Session is null!");
        }
        const user: mongoose.Document|null = await User.findById(req.session.uid);
        if(!user){
            throw new ExpressError("Unable to fetch user!", 404);
        }
        console.log(user.get("videos"));
        const userVideos = await Video.find({
            "_id": {
                $in: user.get("videos")
            }
        });
        console.log(userVideos);
        await Video.deleteMany({_id: {$in: user.get("videos")}})
        //req.session.destroy(()=>{});
        //res.clearCookie('connect.sid');
        res.status(200).json("Successfully deleted User");
    } catch(err){
        next(err);
    }
}

export const getUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.params.id){
            if(!req.session.uid){
                throw new ExpressError("Must specify a user ID!", 404);
            }
            else{
                req.params.id = req.session.uid;
            }
        }
        console.log(req.session.cookie.expires)
        const user: mongoose.Document|null = await User.findById(req.params.id);
        
        if(!user){
            throw new ExpressError(`Can't find user with id: ${req.params.id}`);
        }
        
        const userObj: object|undefined = sanitizeUser(req, res, next, user.toObject());
        if(!userObj){
            throw new ExpressError("Internal server error!")
        }
        
        if(req.params.id === req.session.uid){
            res.status(200).json(userObj);
        }
        else{
            if('updatedAt' in userObj){
                delete userObj.updatedAt;
            }
            if('email' in userObj){
                delete userObj.email;
            }
            res.status(200).json(userObj);
        }
    } catch(err){
        next(err);
    }
}

export const subscribe = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        if(!req.session.uid){
            throw new ExpressError("You must be logged in to subscribe!");
        }
        if(!req.params.id){
            throw new ExpressError("Invalid user ID!", 404);
        }
        console.log(req.session.uid)
        console.log(req.params.id)
        if(req.session.uid == req.params.id){
            throw new ExpressError("You can't subscribe to yourself!");
        }
        const subscribedUser: mongoose.Document|null = await User.findById(req.params.id);
        if(!subscribedUser){
            throw new ExpressError("User not found!", 404);
        }
        const user: mongoose.Document|null = await User.findById(req.session.uid);
        if(!user){
            throw new ExpressError("Unable to fetch current user!", 404);
        }
        const subs: string[]|undefined = user.get('subscribedUsers');
        if(!subs){
            throw new ExpressError("Internal server error!");
        }
        console.log(subs);
        if(!subs.includes(req.params.id)){
            subs.push(req.params.id);
            console.log(subs);
            await User.updateOne({_id:req.session.uid}, {subscribedUsers:subs ,$inc:{subscribers:1}});
        }
        
        res.status(200).json("Success!");

    } catch(err){
        next(err)
    }
}

export const unsubscribe = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        if(!req.session.uid){
            throw new ExpressError("You must be logged in to unsubscribe!");
        }
        if(!req.params.id){
            throw new ExpressError("Invalid user ID!", 404);
        }
        const subscribedUser: mongoose.Document|null = await User.findById(req.params.id);
        if(!subscribedUser){
            throw new ExpressError("User not found!", 404);
        }
        const user: mongoose.Document|null = await User.findById(req.session.uid);
        if(!user){
            throw new ExpressError("Unable to fetch current user!", 404);
        }
        const subs: string[]|undefined = user.get('subscribedUsers');
        if(!subs){
            throw new ExpressError("Internal server error!");
        }
        const index: number = subs.indexOf(req.params.id);
        if(index>=0){
            subs.splice(index, 1);
            await User.updateOne({_id:req.session.uid}, {subscribedUsers:subs, $inc:{subscribers: -1}});
        }
        res.status(200).json("Unsubscribed successfully");

    } catch (err) {
        
    }
}



export const getSubscribers = async (req:express.Request, res: express.Response, next: express.NextFunction) =>{
    try{
        const user: mongoose.Document|null = await User.findById(req.params.id);
        if(!user){
            throw new ExpressError("User not found!", 404);
        }
        const subs: string[] = user.get("subscribedUsers");
        console.log(subs)
        res.status(200).json({id: req.params.id, subscribers: subs});
    } catch(err){
        next(err);
    }
}
