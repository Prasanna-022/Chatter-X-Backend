import mongoose from "mongoose";

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        // Do NOT process.exit(1) in Vercel/Production, it causes 502/500 errors
        // process.exit(1); 
    }
};

export default connectDB;