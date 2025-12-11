import Pusher from "pusher";
import dotenv from "dotenv";

dotenv.config();

const pusher = new Pusher({
  // Use your real keys here for the backend config
  appId: process.env.PUSHER_APP_ID, 
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

export default pusher;