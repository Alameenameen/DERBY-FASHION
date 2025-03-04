const User = require("../../model/userSchema");
const Address = require("../../model/addressSchema")
const Order = require("../../model/orderSchema")
const nodemailer = require("nodemailer");
const dotenv = require("dotenv")
const bcrypt = require("bcrypt");
const session = require("express-session")
dotenv.config()

 

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}


// sending verification email..

async function sendVerificationEmail(email,otp) {
    try {
        const transporter = nodemailer.createTransport({
            service:'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }           
        })

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"OTP for password rest",
            text:`Your OTP is :${otp}`,
            html: `<b> Your OTP : ${otp} </b>`,
        }

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sended :',info.messageId);
        return true;

    } catch (error) {
        console.error("Error in sending Email",error);
        return false;
    }
}

// forget password page
const getForgotPassword = async(req,res)=>{
    try {
        res.render("forgetpass-verify")
    } catch (error) {
        res.render("/login")
    }
}


//forgotEmail Valid..

const forgotEmailValid = async(req,res)=>{
    try {
        const {email} = req.body;
        const findUser = await User.findOne({email:email});

        if(findUser){
            const otp = generateOtp();
            const sendMail = await sendVerificationEmail(email,otp)

            if(sendMail){
                req.session.userOtp = otp;
                req.session.email = email;

                res.render("forgetpass-otpVerify");
                console.log("Forget Pass OTP :",otp);
                
            }else{
                res.json({success:false,message:"Failed to send OTP, Please try again!"})
            }
        }else{
            res.render("forgetpass-verify",{message:"Entered Email not exist"})
        }
    } catch (error) {
        res.redirect("/login")
    }
}

//verify forget password.

const verifyForgetPassOtp = async(req,res)=>{
    try {
        const enteredOtp = req.body.otp;
      console.log("entered otp:",enteredOtp)
      console.log("user otp:",req.session.userOtp)

        if(enteredOtp === req.session.userOtp){
            res.json({success:true,redirectUrl:"/reset-Password"})
        }else{
            res.json({success:false,message:"OTP not matching"})
        }
    } catch (error) {
        res.status(500).json({success:false, message:"An Eroor occured, Please try again"})
    }
}

//reset password page

const getResetPassword = async(req,res)=>{
    try {
        res.render("reset-Password")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}


//resending otp

const resendOtp = async(req,res)=>{
    try {
        const otp = generateOtp()
        req.session.userOtp = otp;
        const email = req.session.email

        const sendMail = await sendVerificationEmail(email,otp)
        if(sendMail){
            console.log("Resend OTP :",otp);
            res.status(200).json({success:true,message:"OTP Resend Successfully"})
        }else{
            res.status(500).json({success:false, message:"Failed to Resend OTP, please try again later!"})
        }
    } catch (error) {
        console.error("Error Re sending OTP",error);
        res.status(500).json({success:false,message:"Internal Server Error, Please try again!"})
    }
}

// bycrypt the password

const securePassword = async(newPass)=>{
    try {
        const passwordHash = await bcrypt.hash(newPass,10);
        return passwordHash
    } catch (error) {
        
    }
}

//validation for new password

const NewPassword = async(req,res)=>{
    try {
        const {newPass, confirmPass} =req.body;
        const email = req.session.email;

        if(newPass === confirmPass){
            const passwordHash = await securePassword(newPass);

            await User.updateOne(
                {email:email},
                {$set:{password:passwordHash}}
            )
            res.redirect("/login")
        }else{
            res.render("reset-password",{message:"Password do not match"})
        }
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}

const userProfile = async(req,res)=>{
    try {

        
       

        const userId = req.session.user
        const userData = await User.findById(userId)

        if (!userData.referalcode) {
            // Generate a new referral code
            const referalcode = generateReferralCode();
            
            // Update the user with the new referral code
            await User.findByIdAndUpdate(userId, { referalcode });
            
            // Update userData to include the new code
            userData.referalcode = referalcode;
        }

        const referralLink = `${req.protocol}://${req.get('host')}/signup?ref=${userData.referalcode}`;
        const messages = req.session.messages || {};
        req.session.messages = {};
        const addressData = await Address.findOne({userId:userId})
        const orders = await Order.find({user:userId})
        .populate('orderedItems.product')
        .sort({ createdOn: -1 })
        .lean();


        const getStatusClass = (status) => {
            switch(status.toLowerCase()) {
                case 'pending':
                    return 'bg-warning';
                case 'delivered':
                    return 'bg-success';
                case 'cancelled':
                    return 'bg-danger';
                case 'returned':
                    return 'bg-secondary';
                default:
                    return 'bg-primary';
            }
        };
        // const orderData = await Order.find({userId:userId}).sort({createdAt:-1}).exec()
        // console.log("orders : ",orderData);
        
        res.render("profile",{user:userData,userAddress:addressData,orders:orders,getStatusClass, messages,referralLink: referralLink}) //  when add the address and orderadata that time you pass useradressand order to profile
    } catch (error) {
        console.error("Error in fetching user profile",error);
        req.session.messages = { error: 'Error loading profile' };
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


const editProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        let { name, phone } = req.body;
        
        // Name validation
        name = name.trim();
        if (!name) {
            return res.json({ status: false, field: 'name', message: 'Name is required' });
        } else if (name.length < 3 || name.length > 50) {
            return res.json({ status: false, field: 'name', message: 'Name must be between 3 and 50 characters' });
        } else if (!/^[A-Za-z\s]+$/.test(name)) {
            return res.json({ status: false, field: 'name', message: 'Name should only contain letters and spaces' });
        }

        // Phone validation
        phone = phone.trim();
        if (!phone) {
            return res.json({ status: false, field: 'phone', message: 'Phone number is required' });
        } else if (!/^[6-9]\d{9}$/.test(phone)) {
            return res.json({ status: false, field: 'phone', message: 'Please enter a valid 10-digit mobile number starting with 6-9' });
        } else if (/^(.)\1{9}$/.test(phone)) {
            return res.json({ status: false, field: 'phone', message: 'Phone number cannot contain all same digits' });
        }

        // Check if phone number already exists
        const existingUser = await User.findOne({ 
            phone: phone,
            _id: { $ne: userId }
        });

        if (existingUser) {
            return res.json({ status: false, field: 'phone', message: 'Phone number already registered with another account' });
        }

        // Update user data
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { name, phone },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.json({ status: false, message: 'User not found' });
        }

        res.json({ status: true, message: 'Profile updated successfully' });

    } catch (error) {
        console.error("Error updating profile:", error);
        res.json({ status: false, message: 'Error updating profile' });
    }
};

const changePassword = async(req,res)=>{
    try {
        res.render("change-password",{ message: null })
    } catch (error) {
      res.redirect("/pageNotFound")   
    }
}



const validateAndChangePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.user; // Assuming session contains the logged-in user ID

        // Fetch the current user from the database
        const currentUser = await User.findById(userId);

        if (!currentUser) {
            return res.render("change-password", {
                message: "User not found.",
            });
        }

        // Validate the old password
        const isOldPasswordValid = await comparePassword(
            oldPassword,
            currentUser.password
        ); // Assume comparePassword is a function to compare passwords

        if (!isOldPasswordValid) {
            return res.render("change-password", {
                message: "Old password is incorrect.",
            });
        }

        // Check if newPassword matches confirmPassword
        if (newPassword !== confirmPassword) {
            return res.render("change-password", {
                message: "New passwords do not match.",
            });
        }

        // Hash the new password
        const hashedPassword = await securePassword(newPassword);

        // Update the user's password in the database
        await User.updateOne(
            { _id: userId },
            { $set: { password: hashedPassword } }
        );

        // Redirect to the profile page or another relevant page
        res.redirect("/userProfile");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};


// Utility function to compare passwords
const comparePassword = async (inputPassword, hashedPassword) => {
    const bcrypt = require("bcrypt");
    return await bcrypt.compare(inputPassword, hashedPassword);
};



//address management

const addressPage = async(req,res)=>{
    try {
        const user = req.session.user;
        
        const { redirectTo } = req.query || 'userProfile'; 
        console.log("aaaaaaaaaaa",redirectTo)
        res.render("addAddress", { user: user, redirectTo: redirectTo });
        // res.render("addAddress",{user:user})
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}

const postaddAddress = async (req, res) => {
    try {
        const {
            addressType,
            name,
            city,
            landMark,
            state,
            pincode,
            phone,
            altPhone,
            redirectTo
        } = req.body;

        const userId = req.session.user;
        // const redirectTo = req.query.redirectTo
        console.log( "sssssssssssssssssssssssssssssssss",redirectTo)
        const userData = await User.findOne({ _id: userId });
        const userAddress = await Address.findOne({ userId: userData._id });


        const validAddressTypes = ['Home', 'Work', 'Other'];
        if (!validAddressTypes.includes(addressType)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid address type' 
            });
        }

        if (!userAddress) {
            const newAddress = new Address({
                userId: userData._id,
                address: [{ addressType, name, city, landMark, state, pincode, phone, altPhone }]
            });

            await newAddress.save();
        } else {
            userAddress.address.push({ addressType, name, city, landMark, state, pincode, phone, altPhone });
            await userAddress.save();
        }
        console.log("Address added successfully");

        
        // Redirecting to checkout and user profile
        if (redirectTo === 'checkout') {
            return res.redirect('/checkout');
        } else {
            return res.redirect('/userProfile');
        }


    } catch (error) {
        console.error("Error adding address:", error);
        res.redirect("/pageNotFound");
    }
};



const editAddress = async(req,res)=>{
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const userAddress = await Address.findOne({"address._id":addressId});

        const currentAddress =userAddress.address.find(address => address._id.toString() === addressId);

        if(!currentAddress){
            return res.status(404).send("Address not found!")
        }

        res.render("edit-address",{address:currentAddress, user:user})

        

    } catch (error) {
        console.error("Error in editing address",error);
        res.redirect("/pageNotFound")
        
    }
}

const postEditAddress = async(req,res)=>{
    try {
        const data = req.body;
        const addressId = req.query.id;
        const user = req.session.user;
        console.log("address id -",addressId)


        const validAddressTypes = ['Home', 'Office', 'Work', 'Other'];

        // Validate address type
        if (!validAddressTypes.includes(data.addressType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address type'
            });
        }

        const findAddress = await Address.findOne({"address._id":addressId});
        console.log("address -",findAddress);
        
        if(!findAddress){
            return res.redirect("/pageNotFound")
        }

        try {

        await Address.updateOne(
            {"address._id":addressId},
            {$set:{"address.$":{
                _id:addressId,
                addressType:data.addressType,
                name:data.name,
                city:data.city,
                landMark:data.landMark,
                state:data.state,
                pincode:data.pincode,
                phone:data.phone,
                altPhone:data.altPhone
            }}}
        )

        res.redirect("/userProfile");
     } catch (validationError) {
        // Handle mongoose validation errors
        if (validationError.name === 'ValidationError') {
            console.error("Validation Error:", validationError);
            // You might want to send this error to a error handling page
            return res.status(400).json({
                success: false,
                message: 'Invalid data provided'
            });
        }
        throw validationError; // Re-throw if it's not a validation error
    }
 
  
    } catch (error) {
        console.error(("Error in updating Address",error));
        res.redirect("/pageNotFound")
    }
}

//deletion

const deleteAddress = async(req,res)=>{
    try {
        const addressId = req.query.id
        const findAddress = await Address.findOne({"address._id":addressId});

        if(!findAddress){
            return res.status(404).send("Cannot find address!")
        }

        await Address.updateOne({"address._id":addressId},
            {$pull:{address:{_id:addressId}}}
        )
        res.redirect("/userProfile")
    } catch (error) {
        console.error("Error in delete address",error);
        res.redirect("/pageNotFound")
    }
}



module.exports ={
    getForgotPassword,
    forgotEmailValid,
    verifyForgetPassOtp,
    getResetPassword,
    resendOtp,
    NewPassword,
    userProfile,
    editProfile,
    changePassword,
    validateAndChangePassword,
    addressPage,
    postaddAddress,
    editAddress,
    postEditAddress,
    deleteAddress
}