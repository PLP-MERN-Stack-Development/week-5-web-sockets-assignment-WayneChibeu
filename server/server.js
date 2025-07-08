import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url'; 

import connectDB from './config/db.js'; 
import Message from './models/messagemodel.js'; 

dotenv.config();

const users = {};
const typingUsers = {};

const startServer = async () => {
  try {
    await connectDB(); 

    const app = express();
    const server = http.createServer(app);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const io = new Server(server, {
      // REMOVED: path: '/my-custom-socket-path/', // Reverting to default /socket.io/ path
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'], // Explicitly prefer websocket
    });

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public'))); // For serving static files if any

    // --- Socket.io connection handler ---
    io.on('connection', async (socket) => { // Added 'async' here to use await
      console.log(`[Server Socket] User connected: ${socket.id}`);

      // --- CATCH-ALL LISTENER FOR DEBUGGING ---
      socket.onAny((eventName, ...args) => {
        console.log(`[Server Socket - DEBUG] Received event: '${eventName}' with data:`, ...args);
      });
      // --- END CATCH-ALL LISTENER ---

      // Handle user joining - REGISTER THIS FIRST!
      socket.on('user_join', (username) => {
        console.log(`[Server Socket] >>> RECEIVED 'user_join' event for: ${username} (Socket ID: ${socket.id}) <<<`);
        users[socket.id] = { username, id: socket.id };
        io.emit('user_list', Object.values(users));
        console.log('[Server Socket] Successfully EMITTED user_list to all clients.');
        io.emit('user_joined', { username, id: socket.id });
        console.log(`[Server Socket] Emitted user_joined for ${username}.`);
      });
      console.log(`[Server Socket] Listener for 'user_join' registered for socket: ${socket.id}`);

      // Handle room history requests
      socket.on('get_room_history', async (roomId) => {
        console.log(`[Server Socket] >>> RECEIVED 'get_room_history' for room: ${roomId} from ${socket.id} <<<`);
        try {
          const roomMessages = await Message.find({ room: roomId })
            .sort({ createdAt: 1 })
            .limit(100); // Fetch last 100 messages for room history
          socket.emit('room_history', { roomId, messages: roomMessages });
          console.log(`[Server Socket] Emitted room_history for ${roomId} to ${socket.id} (${roomMessages.length} messages)`);
        } catch (error) {
          console.error(`[Server Socket] Error fetching room history for ${roomId}:`, error);
          socket.emit('room_history_error', { roomId, error: 'Failed to load room history' });
        }
      });

      // Fetch recent messages from the database and send them to the newly connected user
      try {
        // For now, fetch messages from all rooms to show general chat history
        // Later we'll make this room-specific when the client requests a specific room
        const recentMessages = await Message.find({})
          .sort({ createdAt: 1 })
          .limit(50); // Fetch last 50 messages for chat history
        socket.emit('chat_history', recentMessages); // Emit a new event for chat history
        console.log(`[Server Socket] Emitted chat_history to ${socket.id}`);
      } catch (error) {
        console.error('[Server Socket] Error fetching chat history:', error);
      }

      // Handle incoming messages
      socket.on('message', async (data) => {
        console.log(`[Server Socket] >>> RECEIVED 'message' from ${data.username}: ${data.message} <<<`);
        
        // Broadcast the message to all connected clients
        io.emit('message', {
          username: data.username,
          message: data.message,
          timestamp: new Date(),
          room: data.room || 'general'
        });
        
        // Save message to database
        try {
          const newMessage = new Message({
            username: data.username,
            message: data.message,
            room: data.room || 'general', // Default to 'general' if no room specified
            isPrivate: data.isPrivate || false,
            recipient: data.recipient || null,
            timestamp: new Date()
          });
          await newMessage.save();
          console.log(`[Server Socket] Message saved to database: ${data.username}: ${data.message}`);
        } catch (error) {
          console.error('[Server Socket] Error saving message to database:', error);
        }
        
        console.log(`[Server Socket] Message broadcasted to all clients: ${data.username}: ${data.message}`);
      });

      // Handle typing indicator
      socket.on('typing', (isTyping) => {
        if (users[socket.id]) {
          const username = users[socket.id].username;

          if (isTyping) {
            typingUsers[socket.id] = username;
          } else {
            delete typingUsers[socket.id];
          }

          io.emit('typing_users', Object.values(typingUsers));
          console.log(`[Server Socket] Emitted typing_users: ${Object.values(typingUsers).join(', ')}`);
        }
      });

      // Handle private messages
      socket.on('private_message', async (data) => {
        console.log(`[Server Socket] >>> RECEIVED 'private_message' from ${data.from} to ${data.to}: ${data.message} <<<`);
        
        // Find the recipient's socket
        const recipientSocket = Object.values(users).find(user => user.username === data.to);
        
        if (recipientSocket) {
          // Send to recipient
          io.to(recipientSocket.id).emit('private_message', {
            username: data.from,
            message: data.message,
            timestamp: new Date(),
            isPrivate: true,
            from: data.from,
            to: data.to
          });
          
          // Send back to sender (for confirmation)
          socket.emit('private_message', {
            username: data.from,
            message: data.message,
            timestamp: new Date(),
            isPrivate: true,
            from: data.from,
            to: data.to
          });
          
          // Save private message to database with special room format
          try {
            const newMessage = new Message({
              username: data.from,
              message: data.message,
              room: `private_${[data.from, data.to].sort().join('_')}`, // Consistent room name for both users
              isPrivate: true,
              recipient: data.to,
              timestamp: new Date()
            });
            await newMessage.save();
            console.log(`[Server Socket] Private message saved to database: ${data.from} -> ${data.to}: ${data.message}`);
          } catch (error) {
            console.error('[Server Socket] Error saving private message to database:', error);
          }
          
          console.log(`[Server Socket] Private message sent from ${data.from} to ${data.to}`);
        } else {
          socket.emit('error', { message: `User ${data.to} is not online` });
          console.log(`[Server Socket] User ${data.to} not found for private message`);
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`[Server Socket] User disconnected: ${socket.id}. Reason: ${reason}`);
        if (users[socket.id]) {
          const { username } = users[socket.id];
          io.emit('user_left', { username, id: socket.id });
          console.log(`[Server Socket] ${username} left the chat`);
        }

        delete users[socket.id];
        delete typingUsers[socket.id];

        io.emit('user_list', Object.values(users));
        io.emit('typing_users', Object.values(typingUsers));
      });
    });

    // --- HTTP API routes (now fetch from DB where applicable) ---
    app.get('/api/messages', async (req, res) => {
      try {
        const allMessages = await Message.find({}).sort({ createdAt: 1 });
        res.json(allMessages);
      } catch (error) {
        console.error('[Server HTTP] Error fetching all messages via HTTP:', error);
        res.status(500).json({ message: 'Failed to fetch messages.' });
      }
    });

    app.get('/api/users', (req, res) => {
      res.json(Object.values(users)); // Still returns in-memory active users
    });

    // Root route
    app.get('/', (req, res) => {
      res.send('Socket.io Chat Server is running and connected to MongoDB');
    });

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server due to DB connection error:', error);
    process.exit(1); // Exit if DB connection fails
  }
};

startServer(); // Call the async function to start the server
