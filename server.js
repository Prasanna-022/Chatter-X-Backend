import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from "socket.io"; 
import { createServer } from 'http'; // Import http server
import connectDB from './src/config/db.js'; 

import userRoutes from './src/routes/userRoutes.js'; 
import chatRoutes from './src/routes/chatRoutes.js';
import messageRoutes from './src/routes/messageRoutes.js';
import callLogRoutes from './src/routes/callLogRoutes.js';
import healthcheckRoutes from './src/routes/healthcheckRoutes.js';

import { notFound, errorHandler } from './src/middleware/errorMiddleware.js';
import { apiResponse } from './src/utils/apiResponse.js';
import { configureCloudinary } from './src/utils/cloudinary.js';

dotenv.config();
connectDB();
configureCloudinary();

const app = express();
const httpServer = createServer(app); // Create HTTP server explicitly

// Increase payload limit for images/files
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// --- CORS CONFIGURATION ---
const allowedOrigins = [
    "https://chatter-x-frontend.vercel.app",      
    "https://chatter-x-frontend-qw4x.vercel.app", 
    "http://localhost:5173",          
    process.env.CORS_ORIGIN                       
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log("Blocked by CORS:", origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

app.use(apiResponse);

app.get('/', (req, res) => {
    res.standardSuccess(null, 'NovaChat API is running successfully');
});

app.use('/healthcheck', healthcheckRoutes);
app.use('/user', userRoutes);
app.use('/chat', chatRoutes);
app.use('/message', messageRoutes);
app.use('/call', callLogRoutes);

app.use(notFound);
app.use(errorHandler);

// --- SOCKET.IO & SERVER START ---

const PORT = process.env.PORT || 5000;

// Initialize Socket.io on the HTTP server
const io = new Server(httpServer, {
    pingTimeout: 60000, 
    cors: {
        origin: allowedOrigins,
        credentials: true,
    },
});

io.on("connection", (socket) => {
    console.log("Connected to socket.io");

    socket.on("setup", (userData) => {
        if(userData?._id) {
            socket.join(userData._id);
            socket.emit("connected");
        }
    });

    socket.on("join_chat", (chatId) => {
        socket.join(chatId);
    });
    
    socket.on("new_message", (newMessageReceived) => {
        var chat = newMessageReceived.chat;
        if (!chat.users) return;
        chat.users.forEach((user) => {
            if (user._id === newMessageReceived.sender._id) return; 
            socket.in(user._id.toString()).emit("message_received", newMessageReceived);
        });
    });

    socket.on("typing", (chatId) => socket.in(chatId).emit("typing"));
    socket.on("stop_typing", (chatId) => socket.in(chatId).emit("stop_typing"));
    
    socket.on("call_user", ({ userToCall, signalData, from, name }) => {
        io.to(userToCall.toString()).emit("call_user", { signal: signalData, from, name });
    });

    socket.on("answer_call", (data) => {
        io.to(data.to.toString()).emit("call_accepted", data.signal);
    });
    
    socket.on("end_call", (data) => {
        io.to(data.to.toString()).emit("call_ended");
    });

    socket.off("setup", (userData) => {
        if (userData && userData._id) {
            socket.leave(userData._id.toString());
        }
    });
});

// Start the server (Always listen, regardless of env)
httpServer.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

export default app;