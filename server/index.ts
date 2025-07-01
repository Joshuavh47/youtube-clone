import express from "express";
import mongoose from 'mongoose'
import dotenv from "dotenv";

import userRoutes from "./routes/users";
import commentRoutes from "./routes/comments";
import videoRoutes from "./routes/videos";
import authRoutes from "./routes/auth";
import process from "node:process";
import MongoStore from "connect-mongo";
import session from 'express-session';
import { CipherKey } from "node:crypto";
import cookieParser from 'cookie-parser';
import { ExpressError, handleError } from "./errorHandler";
import { connectKafkaProducer, createTopic } from './kafka/kafka'

//import { verify } from "./verifySession"
dotenv.config();
const sessionMaxAge: number = 1000*10*60;



const app = express();

const connectMongo = () => {
    mongoose.connect(process.env.MONGO as string).then(() => {
        console.log("Connected to DB!");
    }).catch((err:Error)=>{
        throw err;
    });
}

connectMongo();

connectKafkaProducer();
createTopic();

app.use(express.json({
    verify: (req, res, buf) => {
        (req as any).rawBody = buf.toString(); // eslint-disable-line @typescript-eslint/no-explicit-any
    },
}));

app.use(cookieParser())

// Define interface for session objects
declare module "express-session" {
    interface SessionData {
      uid: string;
    }
}

app.use(session({
    secret: process.env.SESSION_SECRET as CipherKey,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: sessionMaxAge,
        secure: false
    },
    store: new MongoStore({
        client: mongoose.connection.getClient(),
        ttl: sessionMaxAge,
        autoRemove: 'native' , 
    }),
}));




app.use("/api/users", userRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/auth", authRoutes);

app.use((err: ExpressError, req: express.Request, res: express.Response) => {
    const error = handleError(err as ExpressError);
    res.status((err as ExpressError).status || 500).json(error as ExpressError);
});

//app.use("/verify", verify)


app.listen(8080, () => {
    
    console.log("Connected!");
    
});



