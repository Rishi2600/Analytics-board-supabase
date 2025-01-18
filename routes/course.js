const{Router} = require("express");
const courseRouter = Router();
const {courseModel} = require("../db");

courseRouter.get("/preview", async function(req, res){
    const courses = await courseModel.find({});
    res.json({
        message: 'all the courses fetched successfully',
        courses: courses
    });
});

module.exports = {
    courseRouter: courseRouter
};