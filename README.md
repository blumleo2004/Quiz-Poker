# Quiz Poker 🎲🧠

A real-time multiplayer quiz game that combines poker-style betting with trivia questions. Players submit numerical answers to questions and bet on their confidence, with the closest answer winning the pot!

## 🎮 Features

### Core Gameplay
- **Real-time Multiplayer**: Built with Socket.IO for instant synchronization
- **Poker-Style Betting**: Four betting rounds with raise, call, and fold mechanics
- **Progressive Hints**: Three hints revealed throughout the game
- **Answer Validation**: Server-side validation ensures fair play
- **Smart Winner Detection**: Closest answer wins, with tie-breaking logic

### Host Features
- **Live Answer Tracking**: See players' submitted answers in real-time
- **Player Management**: Adjust balances, kick players, manage game state
- **Flexible Controls**: Start game, reveal hints, control showdown timing
- **Tournament Mode**: Optional increasing blinds every 3 rounds

### Player Experience
- **Custom Avatars**: Randomizable avatar generation
- **Session Persistence**: Automatic reconnection handling
- **Responsive UI**: Clean, modern interface with animations
- **Audio Feedback**: Sound effects for all game actions

## 🏗️ Architecture

### Backend
```
src/
├── game/
│   └── Game.js           # Core game logic and state management
├── models/
│   ├── Question.js       # MongoDB question schema
│   └── GameSession.js    # Game state persistence
├── config/
│   └── gameConfig.js     # Centralized game constants
├── utils/
│   ├── validators.js     # Input validation utilities
│   └── logger.js         # Winston logging
└── server.js             # Express + Socket.IO server
```

### Frontend (Modular Architecture)
```
src/public/
├── js/modules/
│   ├── AudioManager.js   # Sound effects management
│   ├── FXManager.js      # Visual effects & animations
│   └── UIManager.js      # UI rendering & updates
├── game.js               # Main game client (ES6 modules)
├── index.html            # Game interface
└── styles.css            # Modern, responsive styling
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v14+)
- MongoDB
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/blumleo2004/Quiz-Poker.git
   cd Quiz-Poker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/quiz-poker
   NODE_ENV=development
   ```

4. **Seed the database** (optional)
   ```bash
   npm run seed
   ```

5. **Start the server**
   ```bash
   npm start
   ```

6. **Open your browser**
   Navigate to `http://localhost:3000`

## 🎯 How to Play

### For the Host
1. Enter your name and click "Host Game"
2. Wait for players to join
3. Click "Start Game" when ready
4. Reveal hints strategically during betting rounds
5. Start showdown to determine the winner
6. Click "Next Round" to continue

### For Players
1. Enter your name and click "Join Game"
2. Submit your numerical answer to the question
3. Participate in four betting rounds:
   - **Round 1**: Initial betting
   - **Round 2**: After first hint
   - **Round 3**: After second hint
   - **Round 4**: After third hint
4. Fold if you're not confident, or raise to increase the pot
5. Winner takes the pot!

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test validators.test.js
```

## 📦 Tech Stack

### Backend
- **Express.js**: Web server framework
- **Socket.IO**: Real-time bidirectional communication
- **MongoDB + Mongoose**: Database and ODM
- **Winston**: Logging
- **Joi**: Schema validation
- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing

### Frontend
- **Vanilla JavaScript (ES6 Modules)**: Clean, modular code
- **Socket.IO Client**: Real-time updates
- **Web Audio API**: Sound effects
- **Canvas Confetti**: Celebration animations
- **DiceBear Avatars**: Dynamic avatar generation

### Development
- **Jest**: Unit testing
- **ESLint**: Code linting
- **Nodemon**: Development auto-reload
- **Prettier**: Code formatting

## 🔧 Configuration

### Game Settings (`src/config/gameConfig.js`)
```javascript
MIN_BET: 20                    // Minimum bet amount
BLIND_INCREASE_INTERVAL: 3     // Rounds between blind increases
INITIAL_BALANCE: 1000          // Starting chips per player
```

### Customization
- Add questions via MongoDB or seed script
- Adjust betting rules in `Game.js`
- Modify UI themes in `styles.css`
- Configure audio in `AudioManager.js`

## 📝 API Events (Socket.IO)

### Client → Server
- `joinGame`: Join as player or host
- `startGame`: Begin a new round
- `submitFinalAnswer`: Submit answer
- `playerAction`: Betting action (fold/call/raise)
- `showHint`: Reveal next hint
- `startShowdown`: Begin winner determination

### Server → Client
- `gameStarted`: New round started
- `answerSubmitted`: Player submitted answer (host only)
- `bettingRoundStarted`: New betting round
- `playerAction`: Player action broadcast
- `hintRevealed`: Hint revealed
- `showdownResults`: Winner announcement

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- DiceBear for avatar generation API
- Canvas Confetti for celebration effects
- Socket.IO team for real-time capabilities

## 📧 Contact

Leo Blum - [@blumleo2004](https://github.com/blumleo2004)

Project Link: [https://github.com/blumleo2004/Quiz-Poker](https://github.com/blumleo2004/Quiz-Poker)

---

**Built with ❤️ using Node.js and Socket.IO**