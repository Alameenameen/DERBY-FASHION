
const multer = require("multer");
const path = require("path");


const storage = multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null,path.join(__dirname,"../public/uploads"))
    },
    filename:(req,file,cb)=>{
        cb(null,Date.now()+"-"+file.originalname)
    }
})


const uploads = multer({ storage });

const addBrandWithImage = uploads.single('brandImage');

const uploadCategoryImage = uploads.single('categoryImage');

module.exports = {
    uploads,
    addBrandWithImage,
    uploadCategoryImage,
};

