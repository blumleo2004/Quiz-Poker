# Quiz Poker

A unique combination of poker and quiz games where players bet on their knowledge and compete for the pot. Players answer questions and place bets, with the closest answer winning the pot.

## Current State

The application is a basic working prototype with the following features:
- Real-time multiplayer using Socket.IO
- Basic poker mechanics (blinds, betting)
- Question-answer system with hints
- MongoDB integration for question storage
- Simple player management system

### Technical Stack
- Backend: Node.js with Express
- Real-time Communication: Socket.IO
- Database: MongoDB
- Frontend: Basic HTML/JavaScript (needs improvement)

## Setup Instructions

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Make sure MongoDB is running locally
4. Start the server:
   ```bash
   node server.js
   ```
5. Open `http://localhost:3000` in your browser

## Testing the Application

1. **Basic Game Flow:**
   - Open the application in multiple browser windows
   - In one window, join as "Host"
   - In other windows, join as players with different names
   - Host starts the game when at least 3 players have joined
   - Players place their bets
   - Host closes betting phase
   - Players submit their answers
   - Host reveals the correct answer and winner

2. **Testing Scenarios:**
   - Test with minimum 3 players
   - Test betting with different amounts
   - Test answer submission with both numeric and text answers
   - Test hint system
   - Test player disconnection handling

## Todo List

### High Priority
- [ ] Implement proper authentication system
- [ ] Add input validation and sanitization
- [ ] Implement proper error handling
- [ ] Add rate limiting for socket connections
- [ ] Create proper frontend with modern UI/UX
- [ ] Add proper game state management
- [ ] Implement reconnection handling

### Medium Priority
- [ ] Add proper handling of all-in situations
- [ ] Implement tie-breaking system
- [ ] Add game history and statistics
- [ ] Create spectator mode
- [ ] Add proper logging system
- [ ] Implement caching for frequently accessed data
- [ ] Add pagination for player lists
- [ ] Create proper question management system

### Low Priority
- [ ] Add animations and visual feedback
- [ ] Implement sound effects
- [ ] Add achievements system
- [ ] Create leaderboard
- [ ] Add custom themes
- [ ] Implement chat system
- [ ] Add mobile responsiveness

## Known Issues

1. No proper error handling for edge cases
2. Global state management needs improvement
3. No persistence of game state
4. Basic UI/UX
5. No proper validation of answers
6. Questions are deleted after use
7. No handling of multiple concurrent games

## Contributing

Feel free to contribute to this project by:
1. Forking the repository
2. Creating a feature branch
3. Making your changes
4. Submitting a pull request

## License

This project is currently unlicensed. Please contact the maintainers for usage rights. 