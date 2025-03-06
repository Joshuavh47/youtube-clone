import express, { NextFunction } from 'express';
import mongoose from 'mongoose';
import argon2 from 'argon2';

import User, { sanitizeUser } from '../models/User'
import { ExpressError, handleError } from '../errorHandler';
import session from 'express-session';


export const signup = async (req: express.Request, res: express.Response, next: NextFunction) => {
    try{
        // Ensure all required fields are included in request and not empty
        if(req.body['name'] === "" || req.body['name'] === undefined){
            throw new ExpressError("You must include a name!");
        }
        if(req.body['email'] === "" || req.body['email'] === undefined){
            throw new ExpressError("You must include an email!");
        }
        if(req.body['password'] === "" || req.body['password'] === undefined){
            throw new ExpressError("You must include a password!");
        }

        // Check Mongo if account with this email already exists
        const check: mongoose.Document|null = await User.findOne({email: req.body['email']});
        
        // If it exists then error
        if(check !== null){
            throw new ExpressError("Email already in use!");
        }
        

        // Hash password
        const hash: string = await argon2.hash(req.body['password']);
        
        // Create new user
        const newUser: mongoose.Document|null = new User({...req.body, password: hash});

        // Save to Mongo
        await newUser.save();

        
        const userObj: object|undefined = sanitizeUser(req, res, next, newUser.toObject());


        // Create session with the user's ID and send to mongo
        if(req.session.uid === undefined){
            req.session.uid = newUser?.get('_id')
        }

        console.log("created user");

        res.status(200).json(userObj);
        
    }
    catch(err){
        //Pass the error to handler function
        
        next(err);
    }
}

export const signin = async (req: express.Request, res: express.Response, next: NextFunction) => {
    try{
        
        // Get user from mongo
        const user: mongoose.Document|null= await User.findOne({email: req.body['email']});
        
        if(!user){
            throw new ExpressError("Incorrect username or password", 404);
        }
        console.log(req.session.uid)
        console.log(user.get("_id"))
        if(req.session.uid){
            if(req.session.uid == user.get("_id")){
                throw new ExpressError("You're already signed in!");
            }
            else{
                throw new ExpressError("Only one user can be signed in at a time!");
            }
        }

        // Get user password input
        const password: string = req.body['password'];

        // Get password hash from mongo response
        const hash: string | undefined = user?.get('password');

        // If mongo doesn't find the user or the password is "" or null then error
        if(typeof(hash) === undefined || !('password' in req.body)){
            throw new ExpressError("Incorrect username or password", 404);
        }

        // Hash password
        const match: boolean = await argon2.verify(hash!, password);

        // If password and hash don't match then error
        if(!match){
            throw new ExpressError("Incorrect username or password", 404);
        }

        
        
        const out: object|undefined = sanitizeUser(req, res, next, user.toObject());
        if(!out){
            throw new ExpressError("Internal server error!");
        }

        // Create session with the user's ID and send to mongo
        if(req.session.uid === undefined){
            req.session.uid = user?.get('_id')
        }

        

        console.log("created user");

        res.status(200).json(out);
    }
    catch(err){

        //Pass the error to handler function
        
        next(err);
    }
}

export const signout = (req: express.Request, res: express.Response, next: express.NextFunction)=>{
    try{
        console.log(req.cookies)
        //console.log(req.session.uid)
        if(req.session.uid === undefined){
            throw new ExpressError("Must be signed in to do this!", 404);
        }

        req.session.destroy(()=>{});
        //res.clearCookie('connect.sid')
        res.status(200).json("User signed out successfully!");
    } catch(err){
        next(err)
    }
}

export const verifySession = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        if(!req.session.uid){
            throw new ExpressError("Unauthorized!", 403);
        }
        else{
            next();
        }
    } 
    catch (err){
        next(err);
        console.log("test")
    }
}

export const test = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.log(req.cookies)
    
    
    res.status(200).send("test")
}