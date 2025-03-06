const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../model/userSchema");
const env = require("dotenv").config();


// passport.use(new GoogleStrategy({
//     clientID:process.env.GOOGLE_CLIENT_ID,
//     clientSecret:process.env.GOOGLE_CLIENT_SECRET,
//     callbackURL:"https://derby-ameen.shop/auth/google/callback"
// },


// async (accessToken,refreshToken,profile,done)=>{
//     try {
//         let user = await User.findOne({googleId:profile.id});
//         if(user){
//             return done(null,user);
//         }
//             user = new User({
//                 name:profile.displayName,
//                 email:profile.emails[0].value,
//                 googleId:profile.id,
//             });
//             await user.save();
//             return done(null,user);
        
//     }catch (error) {
//         return done(error,null)
//     }
// }));

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "https://derby-ameen.shop/auth/google/callback",
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if a user exists with the same Google ID
                let user = await User.findOne({ googleId: profile.id });

                if (user) {
                    return done(null, user);
                }

                // Check if the email is already registered (manual signup)
                user = await User.findOne({ email: profile.emails[0].value });

                if (user) {
                    // If user exists but doesn't have googleId, update their account
                    user.googleId = profile.id;
                    await user.save();
                    return done(null, user);
                }

                // If no user exists, create a new one
                user = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                });

                await user.save();
                return done(null, user);
            } catch (error) {
                return done(error, null);
            }
        }
    )
);



passport.serializeUser((user,done)=>{
     done(null,user.id)
})

passport.deserializeUser((id,done)=>{
    User.findById(id)
    .then(user=>{
        done(null,user)
    })
    .catch(err=>{
        done(err,null)
    })
})

module.exports = passport;


