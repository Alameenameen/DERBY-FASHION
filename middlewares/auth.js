
const User = require("../model/userSchema");
const Cart = require("../model/cartSchema");
const Product = require("../model/productSchema")
 

const userAuth =(req,res,next)=>{
    if(req.session.user){
        User.findById(req.session.user)
        .then(data=>{
            if(data && !data.isBlocked){
                next();
            }else{
                res.redirect("/login");
            }
        })
        .catch(error=>{
            console.log("error in user auth middleware",error);
            res.status(500).send("Internal Server eroor")
            
        })
    }else{
        res.redirect("/login")
    }
}


const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        next(); // Session exists, proceed to the next middleware or route
    } else {
        res.redirect("/admin/login"); // No session, redirect to the login page
    }
};




const checkSession = (req,res,next)=>{
    if(req.session.User){
        next()
    }else{
        res.redirect("login")
    }
}

const isLogin = (req,res,next)=>{
    if(req.session.user){
        res.redirect("/")
    }else{
        next()
    }
}



const noCache = (req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    next();
};

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect("/login");
    }
};


const incrementProductViews = async (req, res, next) => {
    try {
        const productId = req.query.id;  // Changed from req.params.productId
        if (productId) {
            await Product.findByIdAndUpdate(
                productId,
                { $inc: { views: 1 } },
                { new: true }
            );
        }
        next();
    } catch (error) {
        next(error);
    }
};






const cartCountMiddleware = async (req, res, next) => {
    try {
        // Initialize cartCount in locals to 0 by default
        res.locals.cartCount = 0;
        
        // Only attempt to get cart count if session and user exist
        if (req.session && req.session.user && req.session.user._id) {
            const cart = await Cart.findOne({ userId: req.session.user._id });
            if (cart && cart.items) {
                // Count unique items, not total quantity
                const cartCount = cart.items.length;
                res.locals.cartCount = cartCount;
                req.session.cartCount = cartCount;
            }
        }
        next();
    } catch (error) {
        console.error("Error in cart count middleware:", error);
        // Even if there's an error, we should continue with the request
        next();
    }
};




module.exports = {
    userAuth,
    adminAuth,
    checkSession,
    isLogin,
    isAuthenticated,
    noCache,
    incrementProductViews,
    cartCountMiddleware
}