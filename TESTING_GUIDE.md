# 🎮 Quiz Poker - Manual Testing Guide

## ✅ Server is Running
The server is now running on **http://localhost:3000**

---

## 🎯 How to Test the Game

### Option 1: Quick Automated Test (Recommended First)
Run the automated test to see the full game flow:

```powershell
node testGameFlow.js
```

This will simulate a complete game with 3 players and show you all the features in action.

---

### Option 2: Manual Browser Test (Most Fun!)

#### Step 1: Open Multiple Browser Windows
1. Open **3 separate browser windows** (or use incognito/private windows)
2. Navigate to **http://localhost:3000** in each window

#### Step 2: Create the Game (Window 1 - Host)
1. In the first window, click **"Host Game"**
2. Enter a name (e.g., "Host")
3. Click **"Join as Host"**
4. **Keep this window open** - this is your host control panel

#### Step 3: Join as Players (Windows 2 & 3)
1. In the second window, click **"Join Game"**
2. Enter a name (e.g., "Alice")
3. Click **"Join as Player"**

4. In the third window, click **"Join Game"**
5. Enter a name (e.g., "Bob")
6. Click **"Join as Player"**

#### Step 4: Start the Game (Host Window)
1. Go back to the **Host window**
2. You should see Alice and Bob in the player list with their avatars
3. Click **"Start Game"** button
4. 🎵 Listen for the **start game sound**!

#### Step 5: Answer the Question (Player Windows)
1. Go to **Alice's window**
   - You'll see the question
   - Enter any number as your answer
   - Click **"Submit Answer"**
   - Notice the personalized **avatar** next to your name

2. Go to **Bob's window**
   - Enter a different number
   - Click **"Submit Answer"**

#### Step 6: First Betting Round
1. After both players answer, **Betting Round 1** starts automatically
2. The **active player's seat will glow** with a pulsing animation
3. Click **"Call/Check"** or **"Raise"** buttons
4. 🎵 Listen for the **chip sound** when you bet!
5. Watch the **flying chip animation** from your seat to the pot
6. The turn automatically moves to the next player

#### Step 7: Show Hints (Host Window)
1. After the betting round completes, go to the **Host window**
2. Click **"Show Hint"** button
3. The hint will display to all players
4. **Betting Round 2** starts

#### Step 8: Continue the Game
1. Repeat betting in Round 2
2. Host shows another hint
3. **Betting Round 3** completes

#### Step 9: Showdown (Host Window)
1. After Round 3, click **"Start Showdown"** in the Host window
2. 🎊 Watch the **confetti animation**!
3. See who wins based on closest answer
4. 🎵 Listen for the **winner sound**!

---

## 🎨 Features to Notice

### Visual Effects:
- ✨ **Personalized Avatars** - Each player has a unique avatar based on their name
- 💫 **Active Player Glow** - The current player's seat pulses with animation
- 🎊 **Confetti on Win** - Celebratory confetti when someone wins
- 💰 **Flying Chips** - Watch chips fly from player to pot when betting
- 😱 **Shake on Error** - Screen shakes if you do something wrong

### Sound Effects:
- 🎵 **Join Sound** - When a player joins
- 🎮 **Start Sound** - When the game begins
- 💰 **Chip Sound** - When placing bets
- 🚫 **Error Sound** - When making invalid actions
- 🎺 **Turn Sound** - When it's your turn
- 🏆 **Win Sound** - When someone wins
- 😔 **Fold Sound** - When someone folds

### Premium Design:
- 🌟 Dark mode with vibrant gradients
- 🎨 Glassmorphism effects
- ✨ Smooth animations
- 🎯 Modern typography (Inter font)

---

## 🔧 Testing Tips

### Clear the Game Between Tests:
```powershell
node clearDB.js
```
Then refresh all browser windows.

### Test Error Handling:
- Try joining with the same name twice
- Try starting with only 1 player
- Try betting when it's not your turn
- Try folding and see what happens

### Test Reconnection:
1. Join as a player
2. Close the browser tab
3. Open a new tab and join with the same name
4. You'll rejoin with your previous state!

---

## 🐛 Troubleshooting

**If the server isn't responding:**
```powershell
# Kill port 3000
npx kill-port 3000

# Clear database
node clearDB.js

# Restart server
npm start
```

**If sounds aren't playing:**
- Make sure your browser isn't muted
- Click somewhere on the page first (browsers require user interaction for audio)

**If animations are laggy:**
- Close other browser tabs
- Make sure hardware acceleration is enabled in your browser

---

## 🎯 Expected Game Flow

```
1. WAITING (Lobby) → Players join
   ↓
2. ANSWERING → Players submit their answers
   ↓
3. BETTING_ROUND_1 → Players bet
   ↓
4. HINT_2 → Host shows first hint
   ↓
5. BETTING_ROUND_2 → Players bet again
   ↓
6. HINT_3 → Host shows second hint
   ↓
7. BETTING_ROUND_3 → Final betting round
   ↓
8. SHOWDOWN → Reveal winner!
   ↓
9. Back to WAITING → Ready for next round
```

---

## 🎊 Enjoy Testing!

Have fun exploring all the new features! The game now has:
- ✅ Sound effects
- ✅ Visual animations
- ✅ Personalized avatars
- ✅ Premium UI/UX
- ✅ Robust backend with validation
- ✅ Session persistence (reconnection support)
- ✅ Complete game flow from start to finish

**Pro Tip:** Open the browser console (F12) in each window to see detailed logs of what's happening behind the scenes!
