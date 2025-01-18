const{Router} = require("express");
const userRouter = Router();
const {userModel, purchaseModel, } = require("../db");
const {z} = require("zod");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {userMiddleware} = require("../middlewares/user");


userRouter.post("/signup", async function(req, res){
    const userschema = z.object({
        username: z.string().min(3).max(50).email(),
        password: z.string().min(3).max(50).regex(/[a-z]/).regex(/[A-Z]/).regex(/[!@#$%^&*(),.?":{}|<>]/),
        firstName: z.string().min(3).max(50),
        lastName: z.string().min(3).max(50)
    });
    const parsedData = userschema.safeParse(req.body);
    if(!parsedData.success){
        res.json({
            message: 'wrong input format',
            error: parsedData.error
        });
    }
    const {username, password, firstName, lastName} = req.body;

    const hashedPassword = await bcrypt.hash(password, 5);

    await userModel.create({
        username: username,
        password: hashedPassword,
        firstname: firstName,
        lastname: lastName
    });

    res.json({
        message: 'User signed-up successfully'
    });
});

userRouter.post("/signin", async function(req, res){
    const userschema = z.object({
        username: z.string().min(3).max(50).email(),
        password: z.string().min(3).max(50).regex(/[a-z]/).regex(/[A-Z]/).regex(/[!@#$%^&*(),.?":{}|<>]/)
    });
    const parsedData = userschema.safeParse(req.body);
    if(!parsedData.success){
        res.json({
            message: 'wrong input format',
            error: parsedData.error
        });
    }
    const {username, password} = req.body;

    const user = await userModel.findOne({
        username: username
    });
    if(!user){
        res.json({
            message: 'incorrect credentials'
        });
    }
    const verifiedPassword = await bcrypt.compare(password, user.password);
    if(!verifiedPassword){
        res.json({
            message: 'incorrect credentials'
        });
    }
    const token = jwt.sign({
        userId: user._id
    }, process.env.JWT_USER_SECRET);

    res.json({
        token: token
    });
});

userRouter.post("/purchase", userMiddleware, async function(req, res){
    const userId = req.userId;
    const courseId = req.body.courseId;

    await purchaseModel.create({
        userId: userId,
        courseId: courseId  
    });
    res.json({
        message: 'user purchased a course'
    });
});

userRouter.get("/purchases", userMiddleware, async function(req, res){
    const userId = req.userId;

    const purchasedCourses = await purchaseModel.find({
        userId: userId
    });
    res.json({
        purchasedCourses: purchasedCourses
    });
});

module.exports = {
    userRouter: userRouter
};