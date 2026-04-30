import express from 'express';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';

import productRouter from './routes/productRoutes.js';
import userRouter from './routes/userRoutes.js';
import jwt from 'jsonwebtoken';
import orderRouter from './routes/orderRoute.js';



const app = express();

app.use(bodyParser.json())

app.use(
    (req,res,next)=>{
        const tokenString = req.header("Authorization")
        if(tokenString != null){
            const token = tokenString.replace("Bearer ", "")
            
            jwt.verify(token, "deenu-first",
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


mongoose.connect("mongodb+srv://admin:123@cluster0.cu2quqq.mongodb.net/?appName=Cluster0").then(()=>{
    console.log("connected to the database");
}).catch(()=>{
    console.log("database connection failed")
}) 




app.use("/products", productRouter);
app.use("/users",userRouter)
app.use("/orders",orderRouter)

app.listen(5000,()=>{
    console.log('server is running');
});