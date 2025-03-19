import mongoose from "mongoose";
import { ExpressError } from "../errorHandler";
import express from "express";


export interface IUser extends mongoose.Document {
    name: string;
    email: string;
    password: string;
    imgURL: string;
    subscribers: number;
    subscribedUsers: [string];
    videos: [string];
    comments: [string];
}

export const UserSchema = new mongoose.Schema<IUser>(
    {
        name: {
            type: String,
            required: true,
            unique: false,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
            unique: false,
        },
        imgURL: {
            type: String,
            required: false,
            unique: false,
        },
        subscribers: {
            type: Number,
            default: 0,
        },
        subscribedUsers: {
            type: [String]
        },
        videos: {
            type: [String]
        },
        comments: {
            type: [String]
        }
    },
    { timestamps: true }
);

export const sanitizeUser = (req: express.Request, res: express.Response, next: express.NextFunction, userObj: object | null): object | undefined => {
    try {
        if (!userObj) {
            throw new ExpressError("Internal server error!");
        }
        if ('password' in userObj) {
            delete userObj.password;
        }
        if ('__v' in userObj) {
            delete userObj.__v;
        }
        if ('subscribedUsers' in userObj) {
            delete userObj.subscribedUsers;
        }

        return userObj;
    } catch (err) {
        next(err)
    }


}

export default mongoose.model("User", UserSchema);
