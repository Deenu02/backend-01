import express from 'express';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';

import productRouter from './routes/productRoutes.js';
import userRouter from './routes/userRoutes.js';
import jwt from 'jsonwebtoken';
import orderRouter from './routes/orderRoute.js';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const { parsed } = dotenv.config({
    path: fileURLToPath(new URL('./.env', import.meta.url)),
    quiet: true,
});

const requiredEnvironment = ['MONGODB_URL', 'JWT_KEY'];
for (const key of requiredEnvironment) {
    if (!process.env[key]?.trim() && parsed?.[key]?.trim()) {
        process.env[key] = parsed[key];
    }
}


const app = express();

app.use(cors())
app.use(bodyParser.json())


app.use(
    (req,res,next)=>{
        const tokenString = req.header("Authorization")
        if(tokenString != null){
            const token = tokenString.replace("Bearer ", "")
            
            jwt.verify(token, process.env.JWT_KEY,
                (err,decoded)=>{
                    if(decoded != null){
                        req.user = decoded
                        next()
                    }else{
                        console.log("invalid token")
                        res.status(403).json({
                            message : "invalid token"
                        })
                    }
                }
            )
        }else{
            next()
        }
    }
)


async function connectDatabase() {
    const missingEnvironment = requiredEnvironment.filter(key => !process.env[key]?.trim());
    if (missingEnvironment.length > 0) {
        console.error(`Missing required environment variables: ${missingEnvironment.join(", ")}. Add them to the backend .env file.`);
        return false;
    }

    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("MongoDB connected successfully");
        return true;
    } catch (error) {
        if (error.syscall === "querySrv" || error.syscall === "queryTxt") {
            console.error("MongoDB connection failed during DNS discovery. Check the DNS resolver or use Atlas's standard connection string.");
        } else if (error.code === 18 || error.code === 8000 || error.codeName === "AuthenticationFailed") {
            console.error("MongoDB connection failed during authentication. Check the application database user's credentials and authSource.");
        } else if (error.name === "MongoParseError") {
            console.error("MongoDB connection failed. Check the format and options of MONGODB_URL.");
        } else if (error.name === "MongooseServerSelectionError") {
            console.error("MongoDB connection failed. No server could be selected. Check Atlas network access, outbound connectivity, TLS, and replica-set settings.");
        } else {
            console.error("MongoDB connection failed. Check the database connection configuration.");
        }
        return false;
    }
}

app.use("/api/products", productRouter);
app.use("/api/users", userRouter);
app.use("/api/orders", orderRouter);

async function startServer() {
    if (!await connectDatabase()) {
        process.exit(1);
    }

    app.listen(5000, () => {
        console.log("server is running");
    });
}

startServer();
