import mongoose from 'mongoose';

const messageSchema = mongoose.Schema(
  {
    sender: {
      type: String, 
      required: true,
    },
    senderId: {
      type: String, 
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true, 
    },
    room: {
      type: String,
      default: 'general', 
    },
    to: {
      type: String, 
      required: false, 
    },
    isPrivate: {
      type: Boolean,
      default: false, 
    },
  },
  {
    timestamps: true, 
  }
);

const Message = mongoose.model('Message', messageSchema);

export default Message;     