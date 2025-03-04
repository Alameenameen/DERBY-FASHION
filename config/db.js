const mongoose = require("mongoose");
const env = require("dotenv")
env.config();

const connectDB = async()=>{
    try{
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB Atlas");
    }catch(error){
       console.log("MongoDB Atlas Connection Error:",error.message);
       process.exit(1);
    }
}

module.exports = connectDB;

