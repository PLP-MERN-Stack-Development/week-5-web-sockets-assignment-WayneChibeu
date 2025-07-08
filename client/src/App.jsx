// socketio-chat/client/src/App.jsx
import React, { useEffect, useState } from 'react';
import { useSocket } from './socket/useSocket'; // Import the custom socket hook

function App() {
  // Use our custom socket hook to get connection status, user list, messages, and functions
  // Now also destructuring 'typingUsers' from the hook
  const { isConnected, users, messages, typingUsers, error, connect, disconnect, sendMessage, setTyping, sendPrivateMessage, getRoomHistory } = useSocket(() => {
    setIsLoadingHistory(false);
  });

  const [username, setUsername] = useState(''); // State for the user's chosen username
  const [currentMessage, setCurrentMessage] = useState(''); // State for the message input field
  const [isLoggedIn, setIsLoggedIn] = useState(false); // State to track if user has joined chat
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check if user has a saved preference, otherwise use system preference
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return JSON.parse(saved);
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [privateRecipient, setPrivateRecipient] = useState(null);
  const [currentRoom, setCurrentRoom] = useState('general');
  const [availableRooms] = useState([
    { id: 'general', name: 'General', icon: '💬' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'development', name: 'Development', icon: '💻' },
    { id: 'random', name: 'Random', icon: '🎲' }
  ]); // Available chat rooms
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Ref for the messages container to enable auto-scrolling
  const messagesEndRef = React.useRef(null);

  // Effect to handle dark mode toggle
  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // Toggle dark mode function
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Effect to scroll to the bottom of the messages container whenever new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Effect to disconnect from the socket server when the component unmounts
  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [disconnect, isConnected]);

  // Handle user joining the chat
  const handleJoinChat = (e) => {
    e.preventDefault();
    if (username.trim()) {
      connect(username); // Only connect here!
      setIsLoggedIn(true);
    }
  };

  // Handle sending a message
  const handleSendMessage = () => {
    if (currentMessage.trim() && username) {
      if (isPrivateMode && privateRecipient) {
        // Send private message
        sendPrivateMessage({
          from: username,
          to: privateRecipient.username,
          message: currentMessage.trim()
        });
      } else {
        // Send public message to current room
        sendMessage({
          username,
          message: currentMessage.trim(),
          room: currentRoom
        });
      }
      setCurrentMessage('');
    }
  };

  // Handle typing status
  const handleTyping = (e) => {
    const messageText = e.target.value;
    setCurrentMessage(messageText);
    if (isConnected) {
      setTyping(messageText.length > 0);
    }
  };

  // Filter out the current user from the typingUsers list
  const otherTypingUsers = typingUsers.filter(typerUsername => typerUsername !== username);

  // Handle starting a private message
  const handlePrivateMessage = (recipient) => {
    setPrivateRecipient(recipient);
    setIsPrivateMode(true);
    setCurrentRoom('private');
    
    // Load private message history for this recipient
    const privateRoomId = `private_${[username, recipient.username].sort().join('_')}`;
    getRoomHistory(privateRoomId);
    console.log(`[App] Starting private conversation with ${recipient.username}, loading history for room: ${privateRoomId}`);
  };

  // Handle canceling private message
  const cancelPrivateMessage = () => {
    setIsPrivateMode(false);
    setPrivateRecipient(null);
  };

  // Handle room change
  const handleRoomChange = (newRoom) => {
    setCurrentRoom(newRoom);
    setIsPrivateMode(false);
    setPrivateRecipient(null);
    
    // Load room history when switching to a room
    if (newRoom !== 'private') {
      setIsLoadingHistory(true);
      getRoomHistory(newRoom);
      console.log(`[App] Switching to room: ${newRoom}, loading history...`);
    } else {
      // Clear messages when switching to private mode
      setMessages([]);
      console.log('[App] Switching to private mode, clearing messages');
    }
  };

  // Filter messages by current room and private messages
  const roomMessages = messages.filter(msg => {
    if (isPrivateMode && privateRecipient) {
      // Show private messages between current user and recipient
      return msg.isPrivate && 
             ((msg.from === username && msg.to === privateRecipient.username) ||
              (msg.from === privateRecipient.username && msg.to === username));
    } else {
      // Show public messages for current room
      return !msg.isPrivate && (msg.room === currentRoom || !msg.room); // Include messages without room (legacy) in general
    }
  });

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors duration-300 flex flex-col items-center justify-center p-6 font-inter">
      {/* Main Container */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-6xl flex flex-col md:flex-row overflow-hidden transition-all duration-300 animate-fade-in">
        {/* Left Panel: Online Users */}
        <div className="w-full md:w-1/3 bg-gray-50 dark:bg-gray-700 p-8 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-600 flex flex-col justify-between animate-slide-in-left">
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-white">Online Users ({users.length})</h2>
            {isConnected ? (
              users.length > 0 ? (
                <ul className="space-y-4">
                  {users.map((userObj) => (
                    <li key={userObj.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                      <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-bold text-lg">
                        {userObj.username ? userObj.username.charAt(0).toUpperCase() : '?'}
                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${userObj.username === username ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                      </div>
                      <div className="flex-1">
                        <span className="text-base font-medium">{userObj.username}</span>
                        {userObj.username === username && <span className="ml-1 text-xs text-indigo-400">(You)</span>}
                      </div>
                      {userObj.username !== username && (
                        <button
                          onClick={() => handlePrivateMessage(userObj)}
                          className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-full transition-colors"
                        >
                          Message
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-600 dark:text-gray-400 text-lg">No other users online.</p>
              )
            ) : (
              <p className="text-red-500 dark:text-red-400 text-lg">Not connected.</p>
            )}
          </div>
          <div className="mt-6 text-base text-gray-600 dark:text-gray-400">
            <p>Status: {isConnected ? 'Online' : 'Offline'}</p>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
        </div>

        {/* Right Panel: Chat Area */}
        <div className="flex-1 p-8 flex flex-col justify-between">
          {!isLoggedIn ? (
            // Login/Username Entry Form
            <div className="flex flex-col items-center justify-center h-full animate-fade-in-up">
              <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-white">Welcome to Chat!</h1>
              <form onSubmit={handleJoinChat} className="w-full max-w-md">
                <input
                  type="text"
                  placeholder="Enter your username"
                  className="input-field mb-6 text-lg"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <button type="submit" className="btn-primary w-full text-lg py-4">
                  Join Chat
                </button>
              </form>
            </div>
          ) : (
            // Chat Interface
            <>
              <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 pb-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                    {availableRooms.find(room => room.id === currentRoom)?.icon}
                    <span className="ml-2">{availableRooms.find(room => room.id === currentRoom)?.name} Room</span>
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {availableRooms.map(room => (
                    <button
                      key={room.id}
                      onClick={() => handleRoomChange(room.id)}
                      className={`px-4 py-2 rounded-full font-medium transition-colors text-sm
                        ${currentRoom === room.id ? 'bg-blue-500 text-white shadow' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-blue-100 dark:hover:bg-blue-600'}`}
                    >
                      {room.icon} {room.name}
                    </button>
                  ))}
                </div>
              </div>
              {/* Messages Display Area */}
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-700 rounded-lg mb-6 shadow-inner custom-scrollbar">
                {isLoadingHistory ? (
                  <div className="flex justify-center items-center h-40">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <span className="ml-4 text-lg text-gray-600">Loading message history...</span>
                  </div>
                ) : roomMessages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-12">
                    <p className="text-xl">
                      {isPrivateMode ? 
                        `No messages yet. Start a conversation with ${privateRecipient?.username}!` :
                        'No messages yet. Be the first to say something!'
                      }
                    </p>
                  </div>
                ) : (
                  roomMessages.map((msg, index) => {
                    let timeString = '';
                    if (msg.timestamp && !isNaN(new Date(msg.timestamp))) {
                      timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }
                    const isOwn = msg.username === username;
                    return (
                      <div key={index} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in`}>
                        <div className={`flex items-end gap-2 max-w-lg ${isOwn ? 'flex-row-reverse' : ''}`}>
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center font-bold text-base">
                            {msg.username ? msg.username.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div className={`message-bubble-compact ${isOwn ? 'bubble-own-compact' : 'bubble-other-compact'}`}> 
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold opacity-80">{isOwn ? 'You' : msg.username}</span>
                              {timeString && <span className="text-xs opacity-60">{timeString}</span>}
                            </div>
                            <p className="text-base break-words whitespace-pre-line">{msg.message}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

              {/* Typing Indicator */}
              {otherTypingUsers.length > 0 && (
                  <div className="flex justify-start mb-4">
                    <div className="bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400 px-4 py-3 rounded-lg text-base">
                      {otherTypingUsers.join(', ')} {otherTypingUsers.length === 1 ? 'is' : 'are'} typing...
                    </div>
                </div>
              )}

                <div ref={messagesEndRef} />
              </div>
              
              {/* Message Input Form - Floating Card Style */}
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center gap-2 px-2 py-2 bg-transparent sticky bottom-0 z-10 w-full">
                <input
                  type="text"
                  placeholder={isPrivateMode ? `Message ${privateRecipient?.username}...` : "Type your message..."}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={currentMessage}
                  onChange={handleTyping}
                  disabled={!isConnected}
                />
                <button
                  type="submit"
                  disabled={!currentMessage.trim() || !isConnected}
                  className="flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-200 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  aria-label="Send"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 20.5l17.5-8.5-17.5-8.5v7l13 1.5-13 1.5v7z" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;