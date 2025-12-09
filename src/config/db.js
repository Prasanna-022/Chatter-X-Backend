import mongoose from "mongoose";

// Global variable to cache the connection across hot reloads in Serverless
let isConnected = false; 

const connectDB = async () => {
    mongoose.set('strictQuery', true);

    if (isConnected) {
        console.log("Using existing MongoDB connection");
        return;
    }

    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // These options are often default now but good for stability
            serverSelectionTimeoutMS: 15000, // Timeout faster if network is bad (5s instead of 30s)
            socketTimeoutMS: 45000,
        });

        isConnected = true;
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        // Do NOT process.exit() here
    }
};

export default connectDB;