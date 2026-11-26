import User from "../models/user.js"
import bcrypt from "bcrypt"; 
import jwt from "jsonwebtoken";

export function createUser(req,res){
    if (req.body.role == "admin"){
        if(req.user!=null){
            if(req.user.role!="admin"){
                res.status(403).json({
                    message : "You are not authorized to create an admin accounts"
                })
                 return
            }
        }else{
            res.status(403).json({
                message : "You are not authorized to create an admin accounts"
            })
            return
        }
    }

    if (typeof req.body.password !== "string" || !req.body.password ||
        typeof req.body.email !== "string" || !req.body.email.trim() ||
        typeof req.body.firstName !== "string" || !req.body.firstName.trim()) {
        return res.status(400).json({ message: "First name, email and password are required" });
    }

    const hashedPassword = bcrypt.hashSync(req.body.password, 10)

    const user = new User({
        firstName : req.body.firstName,
        lastName : req.body.lastName,
        email : req.body.email,
        password : hashedPassword,
        role : req.body.role === "admin" ? "admin" : "customer"
    })

    user.save().then(()=>{
        res.json({
            message : "user created successfully"
        })
    }
).catch(
    (error)=>{
        const status = error.code === 11000 ? 409 : 500;
        res.status(status).json({
            message: status === 409 ? "An account already exists for this email" : "Failed to create user"
        });
    }
)
}

export function loginUser(req,res){
    const email = req.body.email
    const password = req.body.password

    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    if (!process.env.JWT_KEY) {
        return res.status(500).json({ message: "Login is not configured on the server" });
    }

     User.findOne({email : email}).then(
        (user)=>{
            if(user == null){
                res.status(404).json({
                    message : "User not found"
                })
            }else{
                const isPasswordCorrect = bcrypt.compareSync(password, user.password)
                if(isPasswordCorrect){

                    const token = jwt.sign(
                        {
                            email : user.email,
                            firstName : user.firstName,
                            lastName : user.lastName,
                            role : user.role,
                            img : user.img
                        },
                        process.env.JWT_KEY,
                    )

                    res.json({
                        message : "Login successfull",
                        token : token,
                        role : user.role
                    })
                }else{
                    res.status(404).json({
                        message : "Invalid password"
                    })
                }
            }
        }
     ).catch(() => {
        res.status(500).json({
            message: "Login is temporarily unavailable. Please try again."
        });
     });
}

export function isAdmin(req){
    if(req.user == null){
        return false
    }
    if(req.user.role != "admin"){
        return false
    }
    return true
}