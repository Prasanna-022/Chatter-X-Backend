
import asyncHandler from "express-async-handler";
import Message from "../models/messageModel.js";
import User from "../models/userModel.js";
import Chat from "../models/chatModel.js";
import pusher from "../utils/pusher.js"; // Import Pusher

export const sendMessage = asyncHandler(async (req, res) => {
  const { content, chatId } = req.body;

  if (!content || !chatId) {
    return res.sendStatus(400);
  }

  var newMessage = {
    sender: req.user._id,
    content: content,
    chat: chatId,
  };

  try {
    var message = await Message.create(newMessage);

    message = await message.populate("sender", "name pic avatar");
    message = await message.populate("chat");
    message = await User.populate(message, {
      path: "chat.users",
      select: "name pic avatar email",
    });

    await Chat.findByIdAndUpdate(req.body.chatId, { latestMessage: message });

    await pusher.trigger(chatId, "new-message", message);

    res.json({ data: message });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const allMessages = asyncHandler(async (req, res) => {
  try {
    const messages = await Message.find({ chat: req.params.chatId })
      .populate("sender", "name pic avatar email")
      .populate("chat");

    const filteredMessages = messages.filter(
      (msg) => !msg.removedFor.includes(req.user._id)
    );

    res.json({ messages: filteredMessages });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { type } = req.query; 
  const userId = req.user._id;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404);
      throw new Error("Message not found");
    }

    if (type === 'for_everyone') {
      if (message.sender.toString() !== userId.toString()) {
        res.status(401);
        throw new Error("You can only delete your own messages for everyone.");
      }
      await Message.findByIdAndDelete(messageId);
      res.status(200).json({ message: "Message deleted for everyone", id: messageId });

    } else if (type === 'for_me') {
      if (!message.removedFor.includes(userId)) {
        message.removedFor.push(userId);
        await message.save();
      }
      res.status(200).json({ message: "Message deleted for you", id: messageId });
    } else {
      res.status(400);
      throw new Error("Invalid delete type");
    }
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const sendVoiceMessage = asyncHandler(async (req, res) => {
    
    if (!req.file) return res.status(400).send("No audio file uploaded");

    const { chatId } = req.body;
    
    const fileUrl = req.file.path || "http://placeholder.com/audio.mp3"; 

    const newMessage = {
        sender: req.user._id,
        content: "[Voice Message]",
        fileUrl: fileUrl,
        fileType: "audio",
        chat: chatId
    };

    try {
        var message = await Message.create(newMessage);
        message = await message.populate("sender", "name pic avatar");
        message = await message.populate("chat");
        message = await User.populate(message, {
            path: "chat.users",
            select: "name pic avatar email",
        });

        await Chat.findByIdAndUpdate(chatId, { latestMessage: message });
        
        
        await pusher.trigger(chatId, "new-message", message);

        res.json({ data: message });
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});