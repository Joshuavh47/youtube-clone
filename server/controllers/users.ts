import express from 'express';
import mongoose from 'mongoose';
import User, { sanitizeUser } from '../models/User';
import { ExpressError } from '../errorHandler';
import argon2 from 'argon2';
import Video from '../models/Video';
import Comment from '../models/Comment';

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

        // Respond to request
        res.status(200).json(out)
    } catch (err) {
        next(err);
    }
    
    
}

export const deleteUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{
        // Check for session
        if(!req.session.uid){
            throw new ExpressError("Session is null!", 404);
        }

        // Get user and remove from DB
        const user: mongoose.Document|null = await User.findByIdAndDelete(req.session.uid);

        // Make sure user is actually dound and deleted
        if(!user){
            throw new ExpressError("Unable to fetch user!", 404);
        }
        console.log(user.get("videos"));

        // Remove all videos associated with the deleted user from DB
        await Video.deleteMany({_id: {$in: user.get("videos")}});

        // Remove all comments associated with the deleted user from DB
        await Comment.deleteMany({userID: req.session.uid});

        // Destroy session
        req.session.destroy(()=>{});

        // Clear cookie (IDK if this is neccessary but better safe than sorry)
        res.clearCookie('connect.sid');
        
        // Respond to user
        res.status(200).json("Successfully deleted User");
    } catch(err){
        next(err);
    }
}

export const getUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try{

        // If no user is specified in the URL, we will get the user who made the request
        if(!req.params.id){
            if(!req.session.uid){
                throw new ExpressError("Must specify a user ID!", 404);
            }
            else{
                req.params.id = req.session.uid;
            }
        }
        
        console.log(req.session.cookie.expires);

        // Get the user from the DB
        const user: mongoose.Document|null = await User.findById(req.params.id);
        
        // Make sure we actually got the user
        if(!user){
            throw new ExpressError(`Can't find user with id: ${req.params.id}`, 404);
        }
        
        // Make a response object and sanitize it
        const userObj: object|undefined = sanitizeUser(req, res, next, user.toObject());

        // Make sure the response object isn't null
        if(!userObj){
            throw new ExpressError("Internal server error!")
        }
        
        // If the user requests their own profile, respond to the request
        if(req.params.id === req.session.uid){
            res.status(200).json(userObj);
        }
        else{
            // Otherwise, take some information out that we don't want to give out to others
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
        // Check for an active session
        if(!req.session.uid){
            throw new ExpressError("You must be logged in to subscribe!");
        }

        // Make sure that the ID param isn't null
        if(!req.params.id){
            throw new ExpressError("Invalid user ID!", 404);
        }
        console.log(req.session.uid)
        console.log(req.params.id)

        // Make sure the user isn't trying to subscribe to themself
        if(req.session.uid == req.params.id){
            throw new ExpressError("You can't subscribe to yourself!");
        }

        // Get the user that is getting subscribed to from DB
        const subscribedUser: mongoose.Document|null = await User.findById(req.params.id);

        // Make sure we were actually able to get the user
        if(!subscribedUser){
            throw new ExpressError("User not found!", 404);
        }

        // Get the current user
        const user: mongoose.Document|null = await User.findById(req.session.uid);

        // Make sure we were actually able to get the user
        if(!user){
            throw new ExpressError("Unable to fetch current user!", 404);
        }

        // Get a list of users the current user is subscribed to
        const subs: string[]|undefined = user.get('subscribedUsers');

        // Make sure it's not null
        if(!subs){
            throw new ExpressError("Internal server error!");
        }
        console.log(subs);

        // If we aren't already subscribed, add the user being subscribed to to the current user's subscribedUsers array and increment the subscribers count by 1
        if(!subs.includes(req.params.id)){
            await User.updateOne({_id:req.session.uid}, {$addToSet:{subscribedUsers:req.params.id}, $inc:{subscribers:1}});
        }
        
        // Respond to request
        res.status(200).json("Success!");

    } catch(err){
        next(err)
    }
}

export const unsubscribe = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        // Check for active session
        if(!req.session.uid){
            throw new ExpressError("You must be logged in to unsubscribe!");
        }
        
        // Get the user we are trying to unsubscribe to from the DB
        const subscribedUser: mongoose.Document|null = await User.findById(req.params.id);

        // Make sure we were actually able to get the user
        if(!subscribedUser){
            throw new ExpressError("User not found!", 404);
        }

        // Get the current user from the DB
        const user: mongoose.Document|null = await User.findById(req.session.uid);

        // Check to make sure we actually got the user
        if(!user){
            throw new ExpressError("Unable to fetch current user!", 404);
        }

        // Get all users that the current user is subscribed to
        const subs: string[]|undefined = user.get('subscribedUsers');

        // Make sure that we were actually able to get this information
        if(!subs){
            throw new ExpressError("Internal server error!");
        }

        // If the user is subscribed already, remove the unsubscribed user from the current user's subscribedUsers array and decrement the subscribers count
        if(subs.includes(req.params.id)){
            await User.updateOne({_id:req.session.uid}, {$pull:{subscribedUsers:req.params.id}, $inc:{subscribers: -1}});
        }

        // Respond to request
        res.status(200).json("Unsubscribed successfully");

    } catch (err) {
        next(err);
    }
}



export const getSubscribers = async (req:express.Request, res: express.Response, next: express.NextFunction) =>{
    try{
        // Get the user with the specified ID
        const user: mongoose.Document|null = await User.findById(req.params.id);

        // Make sure that we actually have the user
        if(!user){
            throw new ExpressError("User not found!", 404);
        }

        // Get subscribed users from user obj
        const subs: string[] = user.get("subscribedUsers");
        console.log(subs)

        // Respond to request
        res.status(200).json({id: req.params.id, subscribers: subs});
    } catch(err){
        next(err);
    }
}
