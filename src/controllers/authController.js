import User from '../models/userModel.js';
import ApiError from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password, avatar } = req.body;

    if (!name || !email || !password) {
        throw new ApiError(400, 'Please provide name, email, and password.');
    }

    const userExists = await User.findOne({ email });

    if (userExists) {
        throw new ApiError(409, 'User already exists with this email.');
    }

    // Note: Avatar handling here assumes avatar string URL is passed. 
    // If using multer in route, handle logic in userController instead or adapt here.
    // Based on userController.js provided, registration logic there handles files. 
    // This file seems redundant or secondary. Ensure routes point to the correct controller.
    
    const user = await User.create({ name, email, password, avatar });

    if (user) {
        const accessToken = user.generateAccessToken(); // Use model method
        
        res.standardSuccess({
                _id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                token: accessToken, 
            }, 'User registered successfully!', 201)

    } else {
        throw new ApiError(500, 'User creation failed. Invalid data.');
    }
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Please provide email and password");
    }

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        
        // FIX: Use method from userModel to ensure payload consistency (_id)
        const token = user.generateAccessToken(); 
        const refreshToken = user.generateRefreshToken(); // If you implement refresh logic

        // Optional: Save refresh token to DB if your strategy requires it
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        res
            .status(200)
            .cookie('accessToken', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Important for cross-site
                maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
            })
            .json({
                success: true,
                message: "Logged in successfully",
                data: {
                    _id: user._id,
                    name: user.name,
                    fullName: user.name, // Frontend expects fullName sometimes
                    username: user.username,
                    email: user.email,
                    avatar: user.avatar,
                    token: token,
                }
            });

    } else {
        throw new ApiError(401, 'Invalid Email or Password.');
    }
});

export { registerUser, loginUser };