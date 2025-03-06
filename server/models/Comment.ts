import mongoose from "mongoose";

interface IComment extends mongoose.Document {
    userID: string;
    videoID: string;
    desc: string;
}

const CommentSchema = new mongoose.Schema<IComment>(
    {
        userID: {
            type: String, 
            required: true,
        },
        videoID: {
            type: String, 
            required: true,
        },
        desc: {
            type: String, 
            required: true,
        },
    }, 
    {timestamps: true}
);

export default mongoose.model("Comment", CommentSchema);