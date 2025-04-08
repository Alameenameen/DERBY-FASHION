const User = require("../../model/userSchema")
const Category = require("../../model/categorySchema")
const Product = require("../../model/productSchema")
const Wallet = require("../../model/walletSchema")


const env = require("dotenv").config()
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt")


const pageNotFound = async(req,res)=>{
    try{
        res.render("page-404")
    }catch(error){
        res.redirect("/pageNotFound")
    }
}

const getContactPage = async(req, res) => {
    
    res.render('contact'); // contact.ejs in views/
};


const getAboutPage = async(req, res) => {
    
    res.render('about'); // contact.ejs in views/
};



const loadHomepage = async (req, res) => {
    try {
        // Fetch categories that are listed
        const categories = await Category.find({ isListed: true });
        // console.log("img:",categories)

        // Fetch products with at least one variant in stock
        const productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map((category) => category._id) },
            quantity: { $gt: 0 }, 
        })
        .populate('category') 
        .sort({ createdAt: 1 });

       

        // Check if user is authenticated
        if (req.isAuthenticated()) {
            const userData = await User.findOne({ _id: req.user._id }); // Use req.user from Passport
            return res.render("home", { user: userData, products: productData , categories:categories });
        } else {
            return res.render("home", { user: null, products: productData , categories:categories});
        }
    } catch (error) {
        console.error("Error loading homepage:", error);
        res.status(500).send("Server error");
    }
};


// this is not the actual controller , please check shop page route okay

const shoppingPage = async (req, res) => {
    try {
        // Get user data
        const user = req.session.user;
        const userData = await User.findById(user);

        // Get categories
        const categories = await Category.find({ isListed: true });

        // Build query
        let query = {
            isBlocked: false,
            quantity: { $gt: 0 }
        };

        // Handle category filtering
        const selectedCategoryId = req.query.category;
        if (selectedCategoryId) {
            query.category = selectedCategoryId;
        } else {
            const categoryIds = categories.map(category => category._id);
            query.category = { $in: categoryIds };
        }

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const skip = (page - 1) * limit;

        // Fetch products with full category details
        const products = await Product.find(query)
            .populate({
                path: 'category',
                select: 'name categoryOffer.percentage categoryOffer.isActive categoryOffer.startDate categoryOffer.endDate'
            })
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        // Debug log to check populated data
        console.log('Sample product category data:', 
            products.length > 0 ? {
                productName: products[0].productName,
                categoryOffer: products[0].category?.categoryOffer,
            } : 'No products found'
        );

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Prepare category data
        const categoryData = categories.map(category => ({
            _id: category._id,
            name: category.name,
            isSelected: category._id.toString() === selectedCategoryId
        }));

        res.render("shop", {
            user: userData,
            products,
            categories: categoryData,
            totalProducts,
            currentPage: page,
            totalPages,
            selectedCategory: selectedCategoryId
        });

    } catch (error) {
        console.error("Error in shopping page:", error);
        res.redirect("/pageNotFound");
    }
};


const loadSignup = async(req,res)=>{
    try{
        if (req.session.user) {
            return res.redirect('/');
        }
        
        // Get referral code from URL if present
        const referralCode = req.query.ref || '';
        
        res.render('signup', { formData: {}, referralCode });
    }catch(error){
        console.log('Home page not loading',error);
        res.status(500).send("Server Error")
    }
}




//otp generation
function generateOtp() {
    return (Math.floor(100000 + Math.random() * 900000)).toString();
}

async function sendVerificationEmail(email,otp) {
    try{
        const transporter = nodemailer.createTransport({
            service:'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD,
            }
                        
        })

        const info = await transporter.sendMail({
            from:process.env.NODEMAILER_EMAIL,
            to: email,
            subject:"verify your account",
            text : `Your OTP is ${otp}`,
            html:`<b>Your OTP:${otp}</b>`,
        })
        console.log('Email sent:', info.messageId);
        return info.accepted.length>0
    }catch(error){
            console.error("Error sending email",error.message);
            return false
    }
    
}

const SignUp = async(req,res)=>{
    try{
        const{email,name,phone,password,Cpassword,referralCode}= req.body;
        console.log("name",req.body)


        
        if(password !== Cpassword){
            return res.render("signup",{
                message:"passwords do not match",
                formData: {name, email, phone,referralCode} 
            });
        }
        const findUser = await User.findOne({email});
        console.log("finduser-",findUser);
        
        if(findUser){
            return res.render("signup",{
                message:"user with this email already exists",
                errorField: "email", // Add this to identify which field has error
                formData: {name, email, phone,referralCode}
            })
        }


        // let referringUser = null;
        if (referralCode) {
            referringUser = await User.findOne({ referalcode: referralCode });
            if (!referringUser) {
                return res.render("signup", {
                    message: "Invalid referral code",
                    errorField: "referralCode",
                    formData: { name, email, phone,referralCode }
                });
            }
        

        if (referringUser.email === email) {
            return res.render("signup", {
                message: "You cannot use your own referral code",
                errorField: "referralCode",
                formData: { name, email, phone }
            });
        }
    }

        const otp = generateOtp();
        console.log("Generated OTP:",otp)


        const emailSend = await sendVerificationEmail(email,otp);
        console.log(otp)
        if(!emailSend){
            return res.json("email.error")
            // console.error("error")
        }
        // console.log(otp)
        req.session.userOtp = otp;
        console.log(otp)
        req.session.userData = {email,name,phone,password,referralCode};
        // req.session.referringUserId = referringUser ? referringUser._id : null;
        
        // req.session.userData = {
        //     name: req.body.name,
        //     email: req.body.email,
        //     phone: req.body.phone,
        //     password: req.body.password
        // };

        console.log("OTP sent",otp)
        res.render("verify-otp");
       


     

        }catch(error){
           console.error("signup error",error);
           res.redirect("/pageNotFound")
        }
}

const securePassword = async(password)=>{
    try{
        const passwordHash = await bcrypt.hash(password,10)

        return passwordHash
    }catch (error){

    }
}

//verify otp .........

const verifyOtp = async (req,res)=>{
    try{
       const{otp} = req.body;   // enterotp is user entered otp
       console.log("otp",otp);


       if(!req.session.userOtp || !req.session.userData) {
        return res.status(400).json({
            success: false,
            message: "Session expired. Please try again."
        });
    }


       if(otp === req.session.userOtp){
        const user = req.session.userData
        const passwordHash = await securePassword(user.password);
        console.log("hash",passwordHash);
        

        const newUserReferralCode = generateReferralCode();

        const saveUserData = new User({
            name:user.name,
            email:user.email,
            phone:user.phone,
            password:passwordHash,
            referalcode: newUserReferralCode,
            redeemed: user.referralCode ? true : false,
            wallet: 0, // Initialize wallet balance
            redeemedUsers: [] 
        })
        console.log("save",saveUserData);
        
        const savedUser = await saveUserData.save();
        // req.session.user = saveUserData._id;
        
        if (user.referralCode) {
            const referringUser = await User.findOne({ referalcode: user.referralCode });
            
            if (referringUser) {
                // Add new user to referring user's redeemedUsers array
                await User.findByIdAndUpdate(
                    referringUser._id,
                    { $push: { redeemedUsers: savedUser._id } }
                );
                
                // Initialize wallet for new user with sign-up bonus
                const REFERRED_USER_BONUS = 50; // ₹50 bonus for referred user
                await addReferralBonus(
                    savedUser._id,
                    REFERRED_USER_BONUS,
                    `Sign-up bonus from referral by ${referringUser.name}`
                );
                
                // Add referral bonus to referring user
                const REFERRER_BONUS = 100; // ₹100 bonus for referring user
                await addReferralBonus(
                    referringUser._id,
                    REFERRER_BONUS,
                    `Referral bonus for inviting ${savedUser.name}`
                );
            }
        }


        delete req.session.userOtp;
        delete req.session.userData;

        return res.status(200).json({
            success:true,
            message: "Registration successful",
            redirectUrl:"/login"
        });
       }else{
        return res.status(400).json({success:false,message:"Invalid OTP, PLease try again"})
       }
    }catch (error){
        console.error("Error Verifying OTP",error.message);
        res.status(500).json({success:false,message:"An error occured"})
    }
}


const resendOtp = async (req,res)=>{
    try {
        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"})
        }
         const otp = generateOtp();
         req.session.userOtp = otp;

         const emailSend = await sendVerificationEmail(email,otp);
         if(emailSend){
            console.log("resend otp :",otp);
            res.status(200).json({success:true,message:"OTP resend succefully"});
            
         }else{
            res.status(500).json({success:false,message:"Failed to resend otp, please try again"});
         }

    } catch (error) {
        console.error("Error resending otp",error);
        res.status(500).json({success:false,message:"Internal server error, please try again"});
    }
}

const loadLogin = async (req,res)=>{
    try {
        if(!req.session.user){
            return res.render("login")
        }else{
            res.redirect("/")
        }
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}


const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find the user by email and ensure they are not an admin
        const findUser = await User.findOne({ isAdmin: 0, email: email });
        if (!findUser) {
            return res.render("login", { message: "User Not Found" });
        }

        // Check if the user is blocked
        if (findUser.isBlocked) {
            return res.render("login", { message: "User is blocked by admin" });
        }

        // Compare the provided password with the stored hash
        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            return res.render("login", { message: "Incorrect Password" });
        }

        // Optionally use Passport's req.login to handle the session management
        // This is useful if you want Passport to manage the session
        req.login(findUser, (err) => {
            if (err) {
                console.error("Login failed:", err);
                return res.render("login", { message:"Login failed, please try again later" });
            }
            console.log("user id",findUser._id.toString());
            
            // Set session user ID manually (if not using req.login)
            req.session.user = {
                _id: findUser._id.toString(), // Convert ObjectId to string
                email: findUser.email,
                name: findUser.name,
                // Add any other needed user properties
            };




            // Redirect to homepage
            return res.redirect("/");
        });

    } catch (error) {
        console.error("Login error:", error);
        res.render("login", { message: "Login failed, please try again later" });
    }
};


const logout = async (req,res)=>{
    try {
      req.session.destroy((err)=>{
        if(err){
            console.log("Session destruction error",err.message);
            return res.redirect("/pageNotFound");
        }
        return res.redirect("/login")
      }) 
    } catch (error) {
        console.log("Logout error",error);
        res.redirect("/pageNotFound")
    }
}


function generateReferralCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar-looking characters
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

// Add referral bonus to user's wallet
async function addReferralBonus(userId, amount, description) {
    try {
        // Find or create user's wallet
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
            wallet = new Wallet({ user: userId, balance: 0, transactions: [] });
        }
        
        // Add bonus to wallet balance
        wallet.balance += amount;
        
        // Add transaction record
        wallet.transactions.push({
            amount: amount,
            type: 'credit',
            description: description,
            timestamp: new Date()
        });
        
        // Save wallet
        await wallet.save();
        
        // Update user document wallet balance
        await User.findByIdAndUpdate(userId, { wallet: wallet.balance });
        
        return true;
    } catch (error) {
        console.error('Error adding referral bonus:', error);
        return false;
    }
}


const getUserReferralInfo = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.status(401).json({
                success: false,
                message: "User not logged in"
            });
        }
        
        const userId = req.session.user._id;
        const user = await User.findById(userId).populate('redeemedUsers', 'name email createdOn');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        
        // Get referral statistics
        const totalReferrals = user.redeemedUsers ? user.redeemedUsers.length : 0;
        const wallet = await Wallet.findOne({ user: userId });
        
        // Calculate total earnings from referrals
        let totalEarnings = 0;
        if (wallet) {
            const referralTransactions = wallet.transactions.filter(
                t => t.type === 'credit' && t.description.includes('Referral bonus')
            );
            totalEarnings = referralTransactions.reduce((sum, t) => sum + t.amount, 0);
        }
        
        res.json({
            success: true,
            referralInfo: {
                referralCode: user.referalcode || "Not available",
                totalReferrals,
                totalEarnings,
                referredUsers: user.redeemedUsers || []
            }
        });
        
    } catch (error) {
        console.error("Error fetching referral info:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch referral information"
        });
    }
};

module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    SignUp,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    shoppingPage,
    getUserReferralInfo,
    addReferralBonus,
    generateReferralCode,
    getContactPage,
    getAboutPage
}