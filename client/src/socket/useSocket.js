// socketio-chat/client/src/socket/useSocket.js
import { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

// Get the backend URL from environment variables
const SOCKET_URL = import.meta.env.VITE_SOCKET_SERVER_URL;

// Initialize the socket client
// autoConnect is set to false so we can manually connect when a username is provided
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true, // Enable reconnection attempts
  reconnectionAttempts: 5, // Try to reconnect 5 times
  reconnectionDelay: 1000, // Wait 1 second before first reconnection attempt
  transports: ['websocket', 'polling'], // Prefer websocket, fallback to polling
  // REMOVED: path: '/my-custom-socket-path/', // Reverting to default /socket.io/ path
});

// Custom hook for Socket.IO client logic
export const useSocket = (onHistoryLoaded) => {
  const [isConnected, setIsConnected] = useState(false); // Connection status
  const [users, setUsers] = useState([]); // List of online users
  const [messages, setMessages] = useState([]); // List of chat messages
  const [typingUsers, setTypingUsers] = useState([]); // List of users currently typing
  const [error, setError] = useState(null); // Any connection errors
  const [username, setUsername] = useState(''); // Store the current user's username
  const usernameRef = useRef('');

  // Function to connect to the socket server
  const connect = useCallback((user) => {
    if (!user) {
      setError('Username is required to connect.');
      return;
    }
    setUsername(user); // Store the username
    usernameRef.current = user;
    setError(null); // Clear any previous errors

    if (!socket.connected) {
      socket.connect(); // Manually connect the socket
      console.log(`[Client Socket] Attempting to connect as ${user}`);
    }
  }, []);

  // Function to disconnect from the socket server
  const disconnect = useCallback(() => {
    if (socket.connected) {
      socket.disconnect();
      console.log('[Client Socket] Disconnected');
    }
  }, []);

  // Function to send a message
  const sendMessage = useCallback((messageData) => {
    if (socket.connected) {
      socket.emit('message', messageData);
      console.log('[Client Socket] Sent message:', messageData);
    }
  }, [socket]);

  // Function to send a private message
  const sendPrivateMessage = useCallback((recipientId, message) => {
    if (socket.connected && username) {
      socket.emit('private_message', { to: recipientId, message });
      console.log(`[Client Socket] Sent private message to ${recipientId}: ${message}`);
    } else {
      setError('Not connected to send private message or username missing.');
    }
  }, [socket, username]);

  // Function to send typing status
  const sendTypingStatus = useCallback((isTyping) => {
    if (socket.connected) {
      socket.emit('typing', isTyping);
    }
  }, [socket]);

  // Function to get room history
  const getRoomHistory = useCallback((roomId) => {
    if (socket.connected) {
      socket.emit('get_room_history', roomId);
      console.log(`[Client Socket] Requested room history for: ${roomId}`);
    }
  }, [socket]);

  // Main useEffect for handling socket events
  useEffect(() => {
    // Event: 'connect' - fired when the client successfully connects to the server
    const onConnect = () => {
      setIsConnected(true);
      console.log('[Client Socket] Connected to server.');
      // Once connected, emit the 'user_join' event with the username
      if (usernameRef.current) {
        socket.emit('user_join', usernameRef.current);
        console.log(`[Client Socket] Emitted user_join: ${usernameRef.current}`);
      }
    };

    // Event: 'disconnect' - fired when the client disconnects from the server
    const onDisconnect = (reason) => {
      setIsConnected(false);
      setUsers([]); // Clear user list on disconnect
      setTypingUsers([]); // Clear typing users on disconnect
      console.log(`[Client Socket] Disconnected from server. Reason: ${reason}`);
      setError(`Disconnected: ${reason}`);
    };

    // Event: 'connect_error' - fired when there's a connection error
    const onConnectError = (err) => {
      console.error('[Client Socket] Connection Error:', err);
      setIsConnected(false);
      setError(`Connection Error: ${err.message}`);
    };

    // Event: 'user_list' - received when the list of online users updates
    const onUserList = (userList) => {
      setUsers(userList);
      console.log('[Client Socket] User list updated:', userList);
    };

    // Event: 'chat_history' - received when a user first connects (initial messages)
    const onChatHistory = (history) => {
      setMessages(history);
      console.log('[Client Socket] Received chat history:', history);
    };

    // Event: 'typing_users' - received when typing status changes
    const onTypingUsers = (typers) => {
      setTypingUsers(typers);
      console.log('[Client Socket] Typing users:', typers);
    };

    // Listen for new messages
    socket.on('message', (data) => {
      console.log('[Client Socket] Received message:', data);
      setMessages(prev => {
        if (prev.some(
          m => m.timestamp === data.timestamp &&
               m.username === data.username &&
               m.message === data.message
        )) {
          return prev;
        }
        return [...prev, data];
      });
    });

    // Listen for private messages
    socket.on('private_message', (data) => {
      console.log('[Client Socket] Received private message:', data);
      setMessages(prev => [...prev, data]);
    });

    // Listen for room history
    socket.on('room_history', (data) => {
      console.log(`[Client Socket] Received room history for ${data.roomId}:`, data.messages);
      setMessages(data.messages);
      // Clear loading state if callback is provided
      if (onHistoryLoaded) {
        onHistoryLoaded();
      }
    });

    // Listen for general chat history
    socket.on('chat_history', (messages) => {
      console.log('[Client Socket] Received chat history:', messages);
      setMessages(messages);
    });

    // Listen for typing users
    socket.on('typing_users', onTypingUsers);

    // --- Register event listeners ---
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('user_list', onUserList);
    socket.on('chat_history', onChatHistory);
    socket.on('typing_users', onTypingUsers);

    // --- Cleanup function ---
    return () => {
      // Remove all event listeners when the component unmounts or dependencies change
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('user_list', onUserList);
      socket.off('chat_history', onChatHistory);
      socket.off('typing_users', onTypingUsers);
      // Do NOT disconnect socket here, as it's managed by the connect/disconnect functions
      // based on username state in App.jsx
    };
  }, []); // Only run once on mount

  // Return states and functions for components to use
  return {
    isConnected,
    users,
    messages,
    typingUsers,
    error,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    setTyping: sendTypingStatus, // Renamed for consistency with client's App.jsx
    socket, // Expose the socket instance for getting its ID
    getRoomHistory
  };
};
