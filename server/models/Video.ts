import mongoose from "mongoose";


export interface IVideo extends mongoose.Document {
    userID: string;
    videoTitle: string;
    desc: string;
    imgURL: string;
    videoURL: string;
    views: number;
    tags: [string];
    likes: number;
    likedUsers: [string];
    dislikes: number;
    dislikedUsers: [string];
    comments: [string];
}

const VideoSchema = new mongoose.Schema<IVideo>(
    {
        userID: {
            type: String, 
            required: true,
        }, 
        videoTitle: {
            type: String, 
            required: true,
        },
        desc: {
            type: String, 
            required: true,
        },
        imgURL: {
            type: String, 
            required: true,
        },
        videoURL: {
            type: String, 
            required: true,
        },
        views: {
            type: Number, 
            default: 0,
        },
        tags: {
            type: [String], 
            default: []
        },
        likes: {
            type: Number, 
            default: 0
        },
        likedUsers: {
            type: [String], 
            default: []
        },
        dislikes: {
            type: Number, 
            default: 0
        },
        dislikedUsers: {
            type: [String], 
            default: []
        },
        comments: {
            type: [String],
        }
    }, 
    {timestamps: true}
);

export default mongoose.model("Video", VideoSchema);
