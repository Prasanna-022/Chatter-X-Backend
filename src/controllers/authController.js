import User from '../models/userModel.js';
import generateToken from '../config/generateToken.js';
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

    const user = await User.create({ name, email, password, avatar });

    if (user) {
        res
        .standardSuccess({
            _id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            token: generateToken(user._id), // This generates a simple token, inconsistent with the other controller
        }, 'User registered successfully!', 201)
        
    } else {
        throw new ApiError(500, 'User creation failed. Invalid data.');
    }
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {


    const token = jwt.sign(
      { id: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );
        res
        .standardSuccess({
            _id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            token: generateToken(user._id), // Inconsistent token method
        }, 'Login successful!')
        .cookie('accessToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'none',
            maxAge: 1000 * 60 * 60 * 24 * 7, 
        })
        
    } else {
        throw new ApiError(401, 'Invalid Email or Password.');
    }
});

export { registerUser, loginUser };