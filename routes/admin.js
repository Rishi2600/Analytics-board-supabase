const{Router} = require("express");
const adminRouter = Router();
const {adminModel, courseModel} = require("../db");
const {z} = require("zod");
const bcrypt= require("bcrypt");
const jwt = require("jsonwebtoken");
const {adminMiddleware} = require("../middlewares/admin");
const user = require("./user");


adminRouter.post("/signup", async function(req, res){
    const adminschema = z.object({
        username: z.string().min(3).max(50).email(),
        password: z.string().min(3).max(50).regex(/[a-z]/).regex(/[A-Z]/).regex(/[!@#$%^&*(),.?":{}|<>]/),
        firstName: z.string().min(3).max(50),
        lastName: z.string().min(3).max(50)
    });
    const parsedData = adminschema.safeParse(req.body);
    if(!parsedData.success){
        res.json({
            message: 'wrong input format',
            error: parsedData.error
        });
    }
    const {username, password, firstName, lastName} = req.body;

    const hashedPassword = await bcrypt.hash(password, 5);

    await adminModel.create({
        username: username,
        password: hashedPassword,
        firstname: firstName,
        lastname: lastName
    });

    res.json({
        message: 'Admin signed-up successfully'
    });
});

adminRouter.post("/signin", async function(req, res){
    const adminschema = z.object({
        username: z.string().min(3).max(50).email(),
        password: z.string().min(3).max(50).regex(/[a-z]/).regex(/[A-Z]/).regex(/[!@#$%^&*(),.?":{}|<>]/)
    });
    const parsedData = adminschema.safeParse(req.body);
    if(!parsedData.success){
        res.json({
            message: 'wrong input format',
            error: parsedData.error
        });
    }
    const {username, password} = req.body;

    const admin = await adminModel.findOne({
        username: username
    });
    if(!admin){
        res.json({
            message: 'incorrect credentials'
        });
    }
    const verifiedPassword = await bcrypt.compare(password, admin.password);
    if(!verifiedPassword){
        res.json({
            message: 'incorrect credentials'
        });
    }
    const token = jwt.sign({
        adminId: admin._id
    }, process.env.JWT_ADMIN_SECRET);

    res.json({
        token: token
    });
});

adminRouter.post("/course", adminMiddleware, async function(req, res){
    const adminId = req.adminId;

    const courseschema = z.object({
        index: z.string().min(3).max(50),
        description: z.string().min(10),
        price: z.number(),
        courseLink: z.string()
    });
    const parsedData = courseschema.safeParse(req.body)
    if(!parsedData.success){
        res.json({
            error: parsedData.error
        });
    }
    const {index, description, price, courseLink} = req.body;

    const course = await courseModel.create({
        index: index,
        description: description,
        price: price,
        courseLink: courseLink,
        creatorId: adminId
    });
    res.json({
        message: 'course created',
        courseId: course._id,
    });
});

adminRouter.put("/course", adminMiddleware, async function(req, res){
    const adminId = req.adminId;
    const {index, description, price, courseLink, courseId} = req.body;

    const course = await courseModel.updateOne({
        creatorId: adminId,
        _id: courseId
    }, {
        index: index,
        description: description,
        price: price,
        courseLink: courseLink
    });
    res.json({
        message: "course updated for the specific creator",
        course: course
    });
});

adminRouter.get("/course", adminMiddleware, async function(req, res){
    const adminId = req.adminId;

    const courses = await courseModel.find({
        creatorId: adminId
    });
    res.json({
        message: 'all the courses of the specific creator is fetched',
        courses: courses
    });
});

adminRouter.get("/preview", adminMiddleware, async function(req, res){
    const courses = await courseModel.find({});
    res.json({
        message: 'all the courses fetched',
        courses: courses
    });
});

adminRouter.delete("/course", adminMiddleware, async function(req, res){
    const adminId = req.adminId;
    const courseId = req.body.courseId;

    await courseModel.deleteOne({
        creatorId: adminId,
        courseId: courseId
    });
    res.json({
        message: 'Selected course deleted'
    });
});

module.exports = {
    adminRouter: adminRouter
};