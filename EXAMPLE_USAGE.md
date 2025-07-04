# 🏠 Room System - Example Usage

This guide shows you how to use the room system to create and join rooms for real-time communication.

## 🚀 Quick Start

### Step 1: Access the Application
- Open your web browser
- Navigate to `http://localhost:3000` (or your deployed URL)
- You'll see the welcome screen

### Step 2: Set Your Name
- Enter your name when prompted
- Click "Get Started"
- Your name will be saved for the session

### Step 3: Create a Room
1. Click "Create New Room"
2. Enter a room name (e.g., "Team Meeting", "Study Group")
3. Click "Create Room"
4. You'll get a unique 6-character room code (like `ABC123`)
5. Share this code with others

### Step 4: Join a Room
1. Click "Join Room" from the main page
2. Enter the room code someone shared with you
3. Click "Join Room"
4. You'll enter the chat room

## 💬 Using the Chat

### Sending Messages
- Type your message in the input field at the bottom
- Press Enter or click "Send"
- Your message appears instantly for all participants

### Room Features
- **Participants Panel**: See who's currently in the room
- **Real-time Updates**: Messages appear instantly
- **Join/Leave Notifications**: Get notified when people join or leave
- **Responsive Design**: Works on desktop and mobile

## 🎯 Example Scenarios

### Team Collaboration
```
Room Name: "Project Alpha Planning"
Room Code: XYZ789
Participants: Alice, Bob, Carol
Use Case: Quick team standup and task coordination
```

### Study Group
```
Room Name: "Math Study Session"
Room Code: STU123
Participants: Students from Math 101
Use Case: Homework help and exam preparation
```

### Event Coordination
```
Room Name: "Birthday Party Planning"
Room Code: PTY456
Participants: Family and friends
Use Case: Coordinate party details and logistics
```

## 🔧 Tips and Tricks

### Room Codes
- Codes are 6 characters long (letters and numbers)
- Case-insensitive (abc123 = ABC123)
- Unique and randomly generated
- Easy to share via text, email, or voice

### Session Management
- Your name persists during your browser session
- Refresh the page to stay in the same room
- Use "Change Name" to switch identities
- Clear cookies to reset everything

### Best Practices
- Choose descriptive room names
- Share codes securely
- Use rooms for specific topics or time periods
- Leave rooms when you're done to keep participant lists clean

## 🚨 Troubleshooting

### Can't Join a Room?
- Double-check the room code
- Make sure the room is still active
- Try refreshing the page
- Contact the room creator

### Messages Not Appearing?
- Check your internet connection
- Refresh the page
- Make sure JavaScript is enabled
- Try a different browser

### Database Issues?
- Ensure PostgreSQL is running
- Check the DATABASE_URL configuration
- Verify database permissions
- Check server logs for errors

## 📚 Advanced Usage

### Environment Setup
```bash
# For development
DATABASE_URL=postgresql://localhost:5432/roomsystem
SESSION_SECRET=your-secret-key
PORT=3000

# For production
NODE_ENV=production
DATABASE_URL=your-production-db-url
```

### Multiple Rooms
- Users can be in multiple rooms simultaneously
- Each browser tab can join different rooms
- Room codes remain valid until manually deactivated

### Persistence
- All messages are saved in the database
- Room history is preserved
- Users can rejoin rooms and see message history
- Sessions persist across browser restarts

## 🎉 Have Fun!

The room system is designed to be simple, fast, and reliable. Whether you're coordinating with teammates, studying with friends, or planning events, short room codes make it easy to get everyone connected quickly.

Need help? Check the README.md for technical details or create an issue if something isn't working as expected!