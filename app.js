process.env.NODE_NO_WARNINGS = '1';

const express = require("express");
const app = express();
const path = require("path");
const session = require("express-session")
const passport = require("./config/passport")
const env = require("dotenv").config()
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter")
const flash = require('connect-flash');
const {cartCountMiddleware} = require('./middlewares/auth');






db();




app.use(express.json());           //convert json data to read format
app.use(express.urlencoded({extended: true}))    
  //convert queries or string data to........
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        maxAge:1000 * 60 * 60 * 24
    }
}))




app.use(flash());
app.use(cartCountMiddleware);

app.use(passport.initialize());
app.use(passport.session());
app.use((req,res,next)=>{
    res.locals.user = req.user || null;
    next()
})

app.set("view engine","ejs");
app.set("views",[path.join(__dirname,"view/user"),path.join(__dirname,'view/admin')])
// app.use(express.static(path.join(__dirname,'public')));
app.use(express.static(path.join(__dirname, 'public')));
// app.use('/admin-assets', express.static(path.join(__dirname, 'public/admin-assets')));

app.use("/",userRouter);                //receieve user requestes
app.use('/admin',adminRouter)




const PORT = 3030 || process.env.PORT
app.listen(PORT,()=>{
    console.log(`Server running : http://localhost:${PORT}`);
    
})

module.exports = app