import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import User from "../models/userModel.js";
import FriendRequest from "../models/friendRequestModel.js";
import Chat from "../models/chatModel.js";
import { deletefromCloudinary, uploadonCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { Readable } from "stream";
import pusher from "../utils/pusher.js"; // ✅ CRITICAL IMPORT

// --- Helper Functions ---

const generateAccessandRefreshtoken = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new ApiError(404, "User not found");
        }
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });
        return { accessToken, refreshToken };
    }
    catch (error) {
        throw new ApiError(500, error?.message || "Something went wrong while generating tokens");
    }
}

const getPublicIdFromUrl = (url) => {
    if (!url) return null;
    const parts = url.split('/');
    const publicIdWithFormat = parts[parts.length - 1];
    const publicId = publicIdWithFormat.split('.')[0];
    return publicId;
};

const geminiApiCall = async (prompt) => {
    const apiKey = process.env.OPENAI_API_KEY;
    const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
    const MODEL_NAME = "google/gemini-2.5-flash";

    if (!apiKey) {
        throw new Error("AI API key is missing from environment variables.");
    }

    const payload = JSON.stringify({
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": "You are Nova AI, a helpful, fast, and friendly assistant integrated into a chat application."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "max_tokens": 500
    });

    try {
        const response = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: payload
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("OpenRouter API Error:", response.status, errorBody);
            throw new Error(`API rejected request: ${errorBody.message || 'Check quotas/key validity.'}`);
        }

        const result = await response.json();
        const text = result.choices?.[0]?.message?.content;

        if (!text) {
            return "Sorry, I couldn't generate a response right now.";
        }
        return text;

    } catch (error) {
        throw new ApiError(503, error.message || "AI service temporarily unavailable.");
    }
};

// --- Controller Functions ---

const registerUser = asyncHandler(async (req, res) => {
    const { fullName, email, password, username } = req.body;

    if ([fullName, email, username, password].some((field) => !field || field.trim() === "")) {
        throw new ApiError(400, "All fields (Full Name, Email, Username, Password) are required");
    }

    const existedUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }

    let avatarUrl = "https://icon-library.com/images/default-user-icon/default-user-icon-8.jpg";
    let avatarPublicId = null;

    if (req.files?.avatar?.[0]?.buffer) {
        const avatarData = await uploadonCloudinary(req.files.avatar[0].buffer);
        if (avatarData) {
            avatarUrl = avatarData.secure_url; // ✅ HTTPS
            avatarPublicId = avatarData.public_id;
        }
    }

    const user = await User.create({
        name: fullName,
        avatar: avatarUrl,
        password,
        email,
        username: username.toLowerCase(),
        cloudinaryPublicId: avatarPublicId
    });

    const { accessToken, refreshToken } = await generateAccessandRefreshtoken(user._id);
    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    // ✅ FIXED: Cross-Site Cookies for Vercel <-> Render
    const options = {
        httpOnly: true,
        secure: true, // Always true for production (Render)
        sameSite: "none", 
        maxAge: 1000 * 60 * 60 * 24 * 7 
    };

    return res
        .status(201)
        .cookie("accessToken", accessToken, options)
        .json({
            user: createdUser,
            accessToken,
            message: "User registered successfully"
        });
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        const { accessToken } = await generateAccessandRefreshtoken(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                maxAge: 1000 * 60 * 60 * 24 * 7,
            })
            .json({
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    avatar: user.avatar,
                    token: accessToken,
                },
                accessToken,
                message: "Logged in successfully"
            });
    } else {
        throw new ApiError(401, 'Invalid Email or Password.');
    }
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { $set: { refreshToken: undefined } }, { new: true });

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: "none"
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json({ message: "User logged out successfully" });
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request: Refresh token is missing");
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used");
        }

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessandRefreshtoken(user._id);

        const options = { 
            httpOnly: true, 
            secure: true,
            sameSite: "none"
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json({ accessToken, refreshToken: newRefreshToken, message: "Access token refreshed successfully" });
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

const getAllChatUsers = asyncHandler(async (req, res) => {
    const keyword = req.query.search;
    const currentUserId = req.user._id;

    let filter = {};
    if (keyword) {
        filter.$or = [
            { fullName: { $regex: keyword, $options: 'i' } },
            { email: { $regex: keyword, $options: 'i' } },
            { username: { $regex: keyword, $options: 'i' } },
        ];
    }

    filter._id = { $ne: currentUserId };

    const users = await User.find(filter).select("fullName username email avatar");

    return res.status(200).json({ users, message: "Users fetched successfully" });
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json({ user: req.user, message: "User fetched successfully" });
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required");
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { fullName, email }
        },
        { new: true }
    ).select("-password -refreshToken");

    return res.status(200).json({ user, message: "Account details updated successfully" });
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body

    const user = await User.findById(req.user._id);

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(401, "Invalid old password");
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({ message: "Password changed successfully" });
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarBuffer = req.file?.buffer;

    if (!avatarBuffer) {
        throw new ApiError(400, "Avatar file is required");
    }

    const user = req.user;
    const oldPublicId = user.cloudinaryPublicId;

    const avatar = await uploadonCloudinary(avatarBuffer);

    if (!avatar.url) {
        throw new ApiError(500, "Failed to upload avatar to Cloudinary");
    }

    const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
            $set: {
                avatar: avatar.secure_url, // ✅ HTTPS
                cloudinaryPublicId: avatar.public_id
            }
        },
        { new: true }
    ).select("-password -refreshToken");

    if (oldPublicId) {
        await deletefromCloudinary(oldPublicId);
    }

    return res.status(200).json({ user: updatedUser, message: "User avatar updated successfully" });
});

const sendFriendRequest = asyncHandler(async (req, res) => {
    const { recipientUsername } = req.body;
    const senderId = req.user._id;

    const recipient = await User.findOne({ username: recipientUsername });

    if (!recipient) {
        throw new ApiError(404, "Recipient user not found.");
    }

    if (senderId.equals(recipient._id)) {
        throw new ApiError(400, 'Cannot send a friend request to yourself.');
    }

    const existingRequest = await FriendRequest.findOne({
        $or: [
            { sender: senderId, recipient: recipient._id },
            { sender: recipient._id, recipient: senderId }
        ],
        status: { $in: ['pending', 'accepted'] }
    });

    if (existingRequest) {
        throw new ApiError(400, `Friend request already ${existingRequest.status}.`);
    }

    const request = await FriendRequest.create({ sender: senderId, recipient: recipient._id });

    // ✅ TRIGGER PUSHER: Notify Recipient Real-time
    // Channel Name: Recipient's User ID
    // Event Name: 'friend-request-received'
    try {
        await pusher.trigger(recipient._id.toString(), "friend-request-received", {
            message: `New friend request from ${req.user.name}`,
            sender: {
                name: req.user.name,
                username: req.user.username,
                avatar: req.user.avatar
            }
        });
    } catch (err) {
        console.error("Pusher Trigger Error:", err);
    }

    return res.status(201).json({ request, message: 'Friend request sent.' });
});

const getPendingRequests = asyncHandler(async (req, res) => {
    const requests = await FriendRequest.find({ recipient: req.user._id, status: 'pending' })
        .populate('sender', 'fullName username avatar');

    return res.status(200).json({ requests, message: 'Pending friend requests fetched.' });
});

const respondToFriendRequest = asyncHandler(async (req, res) => {
    const { requestId, status } = req.body;
    const recipientId = req.user._id;

    // Populate sender so we can get their ID to notify them
    const request = await FriendRequest.findById(requestId).populate("sender");

    if (!request || !request.recipient.equals(recipientId) || request.status !== 'pending') {
        throw new ApiError(404, 'Request not found or already processed.');
    }

    request.status = status;
    await request.save();

    let message = `Friend request ${status}.`;

    if (status === 'accepted') {
        const createdChat = await Chat.create({
            chatName: "Direct Chat",
            isGroupChat: false,
            users: [request.sender._id, request.recipient],
        });
        message = "Friend request accepted and chat room created.";

        // ✅ TRIGGER PUSHER: Notify Original Sender that request was accepted
        // Channel Name: Sender's User ID
        // Event Name: 'request-accepted'
        try {
            await pusher.trigger(request.sender._id.toString(), "request-accepted", {
                message: `${req.user.name} accepted your friend request`,
                chatId: createdChat._id
            });
        } catch (err) {
            console.error("Pusher Trigger Error:", err);
        }
    }

    return res.status(200).json({ request, message });
});

const askAI = asyncHandler(async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        throw new ApiError(400, "Prompt cannot be empty.");
    }

    const aiReplyText = await geminiApiCall(prompt);

    return res.status(200).json({
        reply: aiReplyText,
        sender: {
            _id: 'AI_ASSISTANT_ID',
            fullName: 'Nova AI'
        },
        message: 'AI response generated successfully.'
    });
});

const updateUserStatus = asyncHandler(async (req, res) => {
    const { online, lastSeen, statusMessage } = req.body;
    const user = req.user;

    if (typeof online !== 'boolean') {
        throw new ApiError(400, "Online status (boolean) is required.");
    }

    const updateFields = { online };

    if (lastSeen) {
        updateFields.lastSeen = new Date(lastSeen);
    }
    if (statusMessage) {
        updateFields.statusMessage = statusMessage;
    }

    const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $set: updateFields },
        { new: true }
    ).select("-password -refreshToken");

    res.status(200).json({ user: updatedUser, message: `Status set to ${online ? 'online' : 'offline'}.` });
});


const updateUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
        user.fullName = req.body.fullName || user.fullName;
        user.username = req.body.username || user.username;
        if (req.body.password) {
            user.password = req.body.password;
        }

        if (req.file) {
             const avatarData = await uploadonCloudinary(req.file.buffer);
             if (avatarData && avatarData.secure_url) {
                 user.avatar = avatarData.secure_url; // ✅ HTTPS
                 user.cloudinaryPublicId = avatarData.public_id;
             }
        }

        const updatedUser = await user.save();
        const accessToken = updatedUser.generateAccessToken();

        res.json({
            _id: updatedUser._id,
            fullName: updatedUser.fullName,
            username: updatedUser.username,
            email: updatedUser.email,
            avatar: updatedUser.avatar,
            accessToken: accessToken, 
        });
    } else {
        res.status(404);
        throw new Error("User not found");
    }
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    getAllChatUsers,
    sendFriendRequest,
    getPendingRequests,
    respondToFriendRequest,
    askAI,
    updateUserStatus,
    updateUserProfile
};