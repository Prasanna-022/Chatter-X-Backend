import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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

// Increase limit for image uploads
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// --- PRODUCTION CORS CONFIGURATION ---
app.use(cors({
    origin: [
        "http://localhost:5173", 
        "https://chatter-x-frontend-v2m8.vercel.app" // ✅ Your specific Vercel URL
    ],
    credentials: true, // Required for cookies to work across domains
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

app.use(apiResponse);

app.get('/', (req, res) => {
    res.standardSuccess(null, 'NovaChat API is running successfully (Pusher + Zego)');
});

app.use('/healthcheck', healthcheckRoutes);
app.use('/user', userRoutes);
app.use('/chat', chatRoutes);
app.use('/message', messageRoutes);
app.use('/call', callLogRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;