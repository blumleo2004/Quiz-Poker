// Game Configuration & State
const socket = io({
    auth: {
        token: localStorage.getItem('qp_token')
    }
});

let gameState = {
    phase: 'WAITING',
    pot: 0,
    players: [],
    currentPlayer: null,
    minBet: 0,
    question: null,
    hints: []
};

let myPlayer = {
    name: localStorage.getItem('qp_name') || '',
    id: null, // socket.id
    role: null,
    balance: 0
};

let currentAvatarSeed = localStorage.getItem('qp_avatar_seed') || Math.random().toString(36).substring(7;

// --- Audio & FX System ---
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playJoin() { this.playTone(440, 'sine', 0.3); setTimeout(() => this.playTone(554, 'sine', 0.3), 100); }
    playStart() {
        this.playTone(440, 'square', 0.1);
        setTimeout(() => this.playTone(554, 'square', 0.1), 100);
        setTimeout(() => this.playTone(659, 'square', 0.4), 200);
    }
    playChip() { this.playTone(800, 'triangle', 0.1, 0.05); }
    playFold() { this.playTone(150, 'sawtooth', 0.3); }
    playWin() {
        [0, 100, 200, 300].forEach((t, i) => setTimeout(() => this.playTone(500 + (i * 100), 'sine', 0.2), t));
    }
    playError() { this.playTone(150, 'sawtooth', 0.4); }
    playTurn() { this.playTone(600, 'sine', 0.2); setTimeout(() => this.playTone(800, 'sine', 0.2), 100); }
}

class FXManager {
    static confetti() {
        if (window.confetti) {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#00ff88', '#00ccff', '#ff00cc']
            });
        }
    }

    static shake(element) {
        element.classList.add('shake-anim');
        setTimeout(() => element.classList.remove('shake-anim'), 500);
    }

    static highlightTurn(socketId) {
        document.querySelectorAll('.player-seat').forEach(seat => {
            const isActive = seat.dataset.id === socketId;
            seat.classList.toggle('active-turn', isActive);
            
            // Update transform to maintain position but scale if active
            const currentLeft = seat.style.left;
            const currentTop = seat.style.top;
            if (currentLeft && currentTop) {
                seat.style.transform = `translate(-50%, -50%) ${isActive ? 'scale(1.15)' : 'scale(1)'}`;
            }
            
            // Add/remove active indicator
            let indicator = seat.querySelector('.active-indicator');
            if (isActive && !indicator) {
                indicator = document.createElement('div');
                indicator.className = 'active-indicator';
                indicator.textContent = '▶';
                seat.insertBefore(indicator, seat.firstChild);
            } else if (!isActive && indicator) {
                indicator.remove();
            }
        });
    }

    static animateChips(fromElement, toElement) {
        if (!fromElement || !toElement) return;

        const startRect = fromElement.getBoundingClientRect();
        const endRect = toElement.getBoundingClientRect();

        const chip = document.createElement('div');
        chip.className = 'flying-chip';
        chip.textContent = '🪙';
        chip.style.left = `${startRect.left + startRect.width / 2}px`;
        chip.style.top = `${startRect.top + startRect.height / 2}px`;

        document.body.appendChild(chip);

        // Force reflow
        chip.getBoundingClientRect();

        chip.style.transform = `translate(${endRect.left - startRect.left}px, ${endRect.top - startRect.top}px)`;

        setTimeout(() => {
            chip.remove();
            audio.playChip(); // Play sound when chip hits pot
        }, 600);
    }
}

const audio = new SoundManager();

// DOM Elements
const screens = {
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen')
};

const ui = {
    playerNameInput: document.getElementById('playerName'),
    joinGameBtn: document.getElementById('joinGameBtn'),
    hostGameBtn: document.getElementById('hostGameBtn'),
    toastContainer: document.getElementById('toast-container'),
    connectionStatus: document.getElementById('connection-status'),
    statusText: document.getElementById('status-text'),

    // Game Header
    roomId: document.getElementById('roomId'),
    phaseDisplay: document.getElementById('phase-display'),
    myPlayerNameDisplay: document.getElementById('myPlayerNameDisplay'),
    myPlayerChipsDisplay: document.getElementById('myPlayerChipsDisplay'),

    // Table Area
    potAmount: document.getElementById('pot-amount'),
    questionDisplay: document.getElementById('question-display'),
    questionText: document.getElementById('question-text'),
    hintsDisplay: document.getElementById('hints-display'),
    seatsContainer: document.getElementById('seats-container'),

    // Controls
    playerControls: document.getElementById('player-controls'),
    hostControls: document.getElementById('host-controls'),
    answerControls: document.getElementById('answer-controls'),

    // Inputs
    betInput: document.getElementById('betInput'),
    answerInput: document.getElementById('answerInput'),

    // Buttons
    foldBtn: document.getElementById('foldBtn'),
    callBtn: document.getElementById('callBtn'),
    raiseBtn: document.getElementById('raiseBtn'),
    submitAnswerBtn: document.getElementById('submitAnswerBtn'),
    startGameBtn: document.getElementById('startGameBtn'),
    revealHintBtn: document.getElementById('revealHintBtn'),
    revealAnswerBtn: document.getElementById('revealAnswerBtn'), // New button
    startShowdownBtn: document.getElementById('startShowdownBtn'),
    nextQuestionBtn: document.getElementById('nextQuestionBtn'), // New button
    skipQuestionBtn: document.getElementById('skipQuestionBtn'), // New button
    answerStatus: document.getElementById('answer-status'),
    answerStatusList: document.getElementById('answer-status-list'),

    // Player Management
    managePlayersBtn: document.getElementById('managePlayersBtn'),
    playerManagementModal: document.getElementById('player-management-modal'),
    closeManagementBtn: document.getElementById('closeManagementBtn')
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    if (myPlayer.name) {
        ui.playerNameInput.value = myPlayer.name;
    }

    // Avatar Customization
    const avatarPreviewImg = document.getElementById('avatarPreviewImg');
    const randomizeAvatarBtn = document.getElementById('randomizeAvatarBtn');

    function updateAvatarPreview() {
        if (avatarPreviewImg) {
            avatarPreviewImg.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentAvatarSeed}&backgroundColor=b6e3f4`;
        }
    }

    if (randomizeAvatarBtn) {
        randomizeAvatarBtn.addEventListener('click', () => {
            currentAvatarSeed = Math.random().toString(36).substring(7);
            localStorage.setItem('qp_avatar_seed', currentAvatarSeed);
            updateAvatarPreview();
        });
    }
    
    // Initial preview update
    updateAvatarPreview();

    // Event Listeners
    ui.joinGameBtn.addEventListener('click', () => attemptJoin('player'));
    ui.hostGameBtn.addEventListener('click', () => attemptJoin('host'));

    // Clear Session (for testing multiple players)
    const clearSessionBtn = document.getElementById('clearSessionBtn');
    if (clearSessionBtn) {
        clearSessionBtn.addEventListener('click', () => {
            localStorage.clear();
            location.reload();
        });
    }

    // Logout Button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to leave the game?')) {
                localStorage.removeItem('qp_token');
                localStorage.removeItem('qp_name');
                location.reload();
            }
        });
    }

    ui.startGameBtn.addEventListener('click', () => socket.emit('startGame'));
    ui.revealHintBtn.addEventListener('click', () => socket.emit('showHint'));
    if (ui.revealAnswerBtn) {
        ui.revealAnswerBtn.addEventListener('click', () => socket.emit('revealAnswer'));
    }
    ui.startShowdownBtn.addEventListener('click', () => socket.emit('startShowdown'));
    
    const resetGameBtn = document.getElementById('resetGameBtn');
    if (resetGameBtn) {
        resetGameBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the game? This will kick all players.')) {
                socket.emit('resetGame');
            }
        });
    }

    ui.submitAnswerBtn.addEventListener('click', submitAnswer);
    
    const revealMyAnswerBtn = document.getElementById('revealMyAnswerBtn');
    if (revealMyAnswerBtn) {
        revealMyAnswerBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reveal your answer to everyone?')) {
                socket.emit('revealMyAnswer');
                revealMyAnswerBtn.disabled = true; // Disable after clicking
            }
        });
    }

    ui.foldBtn.addEventListener('click', () => sendAction('fold'));
    ui.callBtn.addEventListener('click', () => sendAction('call'));
    ui.raiseBtn.addEventListener('click', () => {
        const amount = parseInt(ui.betInput.value);
        if (amount > 0) sendAction('raise', amount);
        else showToast('Please enter a valid amount', 'error');
    });

    // Quick Bet Buttons
    document.querySelectorAll('.btn-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.amount;
            const action = e.target.dataset.action;
            handleQuickBet(type, action);
        });
    });

    const resetRoundBtn = document.getElementById('resetRoundBtn');
    if (resetRoundBtn) {
        resetRoundBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the current round?')) {
                socket.emit('resetRound');
            }
        });
    }

    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    if (nextQuestionBtn) {
        nextQuestionBtn.addEventListener('click', () => {
            socket.emit('nextRound');
        });
    }

    const skipQuestionBtn = document.getElementById('skipQuestionBtn');
    if (skipQuestionBtn) {
        skipQuestionBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to skip this question?')) {
                socket.emit('skipQuestion');
            }
        });
    }

    const managePlayersBtn = document.getElementById('managePlayersBtn');
    const playerManagementModal = document.getElementById('player-management-modal');
    const closeManagementBtn = document.getElementById('closeManagementBtn');

    if (managePlayersBtn) {
        managePlayersBtn.addEventListener('click', () => {
            renderPlayerManagementList();
            playerManagementModal.classList.remove('hidden');
        });
    }

    if (closeManagementBtn) {
        closeManagementBtn.addEventListener('click', () => {
            playerManagementModal.classList.add('hidden');
        });
    }

    // Close modal when clicking outside
    if (playerManagementModal) {
        playerManagementModal.addEventListener('click', (e) => {
            if (e.target === playerManagementModal) {
                playerManagementModal.classList.add('hidden');
            }
        });
    }
});

// --- Socket Events ---

socket.on('connect', () => {
    updateConnectionStatus(true);
    myPlayer.id = socket.id;
});

socket.on('disconnect', () => {
    updateConnectionStatus(false);
});

socket.on('sessionRestored', (data) => {
    console.log('Session restored:', data);
    localStorage.setItem('qp_token', data.token); // Update token
    localStorage.setItem('qp_name', data.name);
    myPlayer.name = data.name;
    myPlayer.role = data.role;
    showScreen('game');
    updateMyProfileDisplay();
    showToast('Session restored!', 'success');
});

socket.on('sessionCreated', (data) => {
    console.log('Session created:', data);
    localStorage.setItem('qp_token', data.token);
    localStorage.setItem('qp_name', data.name);
    myPlayer.name = data.name;
    myPlayer.role = data.role;
    showScreen('game');
    updateMyProfileDisplay();
});

socket.on('gameState', (state) => {
    console.log('Game State:', state);
    gameState = state;
    renderGameState();
});

socket.on('playerJoined', (state) => {
    gameState = state; // Usually sends full state
    renderGameState(); // Use renderGameState instead of just renderSeats to update everything
    showToast('A player joined the game', 'success');
});

socket.on('errorMessage', (msg) => {
    showToast(msg, 'error');
    audio.playError();
    FXManager.shake(document.body);
});

socket.on('activePlayerChanged', (data) => {
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
    if (data.activePlayer === myPlayer.name) {
        audio.playTurn();
        showToast("It's your turn!", 'warning');
    }
});

socket.on('nextRoundReady', (data) => {
    showToast('Next Round Starting...', 'info');
    
    // Clear hints display when starting a new round
    if (ui.hintsDisplay) {
        ui.hintsDisplay.innerHTML = '';
        ui.hintsDisplay.classList.add('hidden');
    }
    
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
});

socket.on('gameStarted', (data) => {
    showToast('Game Started!', 'success');
    audio.playStart();
    
    // Force clear previous state visuals
    if (ui.questionDisplay) {
        const winnerAnnounce = ui.questionDisplay.querySelector('.winner-announce');
        if (winnerAnnounce) winnerAnnounce.remove();
        const revealedAnswer = ui.questionDisplay.querySelector('.revealed-answer');
        if (revealedAnswer) revealedAnswer.remove();
    }
    
    if (data.question) {
        showQuestion(data.question);
    }
    // Update gameState from the event data
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
});

socket.on('bettingRoundStarted', (data) => {
    showToast(`Betting Round ${data.round} Started!`, 'info');
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
    // Logic to highlight active player is in renderSeats()
    if (data.activePlayer === myPlayer.name) {
        audio.playTurn();
    }
});

socket.on('playerAction', (data) => {
    const actionMsg = `${data.player} ${data.action}s ${data.amount ? data.amount : ''}`;
    showToast(actionMsg, 'info');

    if (data.action === 'fold') audio.playFold();
    else {
        // Animate chips flying to pot
        const seat = findSeatByPlayerName(data.player);
        if (seat && (data.action === 'call' || data.action === 'raise' || data.action === 'bet')) {
            FXManager.animateChips(seat, ui.potAmount);
        } else {
            audio.playChip();
        }
    }

    // Animate chips or action badge?
    const seat = findSeatByPlayerName(data.player);
    if (seat) showActionBadge(seat, data.action);

    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
});

socket.on('playerRevealedAnswer', (data) => {
    showToast('A player revealed their answer!', 'warning');
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
});

socket.on('answerSubmitted', (data) => {
    if (myPlayer.role === 'host') {
        showToast(`${data.player} submitted an answer.`, 'info');
        updateAnswerStatus();
    }
});

socket.on('playerAnswered', (data) => {
    if (gameState.players) {
        const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players);
        const player = playersList.find(p => p.id === data.playerId || p.socketId === data.playerId);
        if (player) {
            player.hasAnswered = true;
            updateAnswerStatus();
        }
    }
});

socket.on('hintRevealed', (data) => {
    showToast(`Hint Revealed!`, 'warning');
    const hintBox = ui.hintsDisplay;
    hintBox.classList.remove('hidden');
    
    // Add hint item with better styling
    const hintItem = document.createElement('div');
    hintItem.className = 'hint-item';
    hintItem.textContent = data.hint;
    hintBox.appendChild(hintItem);
    
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
});

socket.on('enableHintButton', (data) => {
    if (myPlayer.role === 'host') {
        ui.revealHintBtn.disabled = !data.enabled;
    }
});

socket.on('enableRevealAnswerButton', (data) => {
    if (myPlayer.role === 'host' && ui.revealAnswerBtn) {
        ui.revealAnswerBtn.disabled = !data.enabled;
    }
});

socket.on('answerRevealed', (data) => {
    showToast(data.message, 'warning');
    
    // Show the answer in the hints display (as requested)
    const hintBox = ui.hintsDisplay;
    hintBox.classList.remove('hidden');

    const answerItem = document.createElement('div');
    answerItem.className = 'hint-item answer-reveal';
    answerItem.innerHTML = `<strong>Correct Answer:</strong> ${data.answer}`;
    hintBox.appendChild(answerItem);
    
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
});

socket.on('enableShowdownButton', (data) => {
    if (myPlayer.role === 'host') {
        ui.startShowdownBtn.disabled = !data.enabled;
    }
});

socket.on('showdown', (data) => {
    showToast(`Showdown! Winner: ${data.winnerName}`, 'success');
    audio.playWin();
    FXManager.confetti();
    // Show results in a modal or overlay?
    // For now, maybe just in the question area
    ui.questionDisplay.innerHTML += `
        <div class="winner-announce">
            <h4>Winner: ${data.winnerName}</h4>
            <p>Correct Answer: ${data.correctAnswer}</p>
        </div>
    `;
    
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
});

socket.on('nextBettingRoundReady', (data) => {
    showToast(data.message, 'info');
    
    // Clear hints display when ready for next betting round (before hint phase)
    // The hints will be shown again when the host reveals them
    if (ui.hintsDisplay && data.nextPhase && data.nextPhase.includes('HINT_')) {
        // Only clear if we're entering a new hint phase (not if hints already exist)
        if (!data.gameState?.revealedHints || data.gameState.revealedHints.length === 0) {
            ui.hintsDisplay.innerHTML = '';
        }
    }
    
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
});

socket.on('bettingComplete', (data) => {
    showToast(data.message, 'info');
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
});

socket.on('showdownResults', (data) => {
    // Handle detailed showdown results
    console.log('Showdown Results:', data);
    // You might want to show a modal here instead of just updating state
    if (data.gameState) {
        gameState = data.gameState;
        renderGameState();
    }
    
    // Display winners
    let winnerText = data.winners.map(w => w.name).join(', ');
    showToast(`Winner(s): ${winnerText}`, 'success');
    audio.playWin();
    FXManager.confetti();

    ui.questionDisplay.innerHTML = `
        <div class="winner-announce">
            <h4>Winner: ${winnerText}</h4>
            <p>Correct Answer: ${data.correctAnswer}</p>
            <div class="results-details">
                ${data.winners.map(w => `<p>${w.name}: ${w.finalAnswer} (Diff: ${w.accuracy})</p>`).join('')}
            </div>
        </div>
    `;
});

socket.on('gameReset', (data) => {
    showToast(data.message, 'warning');
    
    // Clear hints display when game is reset
    if (ui.hintsDisplay) {
        ui.hintsDisplay.innerHTML = '';
        ui.hintsDisplay.classList.add('hidden');
    }
    
    // Clear answer status
    if (ui.answerStatus) {
        ui.answerStatus.classList.add('hidden');
        if (ui.answerStatusList) {
            ui.answerStatusList.innerHTML = '';
        }
    }
    
    localStorage.clear();
    setTimeout(() => {
        location.reload();
    }, 2000);
});

// --- Player Management ---

socket.on('kicked', (data) => {
    alert(data.message || 'You have been kicked from the game.');
    localStorage.removeItem('qp_token');
    localStorage.removeItem('qp_name');
    location.reload();
});

function renderPlayerManagementList() {
    const listContainer = document.getElementById('management-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    const playersList = Array.isArray(gameState.players) 
        ? gameState.players 
        : Object.values(gameState.players || {});
        
    const playerPlayers = playersList.filter(p => p.role === 'player');
    
    if (playerPlayers.length === 0) {
        listContainer.innerHTML = '<div class="text-center text-muted">No players connected.</div>';
        return;
    }
    
    playerPlayers.forEach(player => {
        const item = document.createElement('div');
        item.className = 'management-item';
        
        const avatarSeed = player.avatarSeed || player.name;
        
        item.innerHTML = `
            <div class="mgmt-player-info">
                <div class="player-avatar" style="width: 40px; height: 40px;">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}&backgroundColor=b6e3f4" alt="Avatar">
                </div>
                <div>
                    <div style="font-weight: bold;">${player.name}</div>
                    <div style="font-size: 0.8rem; color: var(--accent-warning);">🪙 ${player.balance}</div>
                </div>
            </div>
            <div class="mgmt-controls">
                <button class="btn btn-success btn-xs" onclick="adjustBalance('${player.socketId}', 100)">+100</button>
                <button class="btn btn-success btn-xs" onclick="adjustBalance('${player.socketId}', 1000)">+1k</button>
                <button class="btn btn-warning btn-xs" onclick="adjustBalance('${player.socketId}', -100)">-100</button>
                <button class="btn btn-danger btn-xs" onclick="kickPlayer('${player.socketId}', '${player.name}')">Kick</button>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

// Expose functions to global scope for onclick handlers
window.adjustBalance = (targetId, amount) => {
    socket.emit('adjustBalance', { targetId, amount });
    // Optimistic update or wait for state? Wait for state is safer.
};

window.kickPlayer = (targetId, name) => {
    if (confirm(`Are you sure you want to kick ${name}?`)) {
        socket.emit('kickPlayer', { targetId });
        // Close modal or refresh list? List will refresh on state update if we hook it up
        // But for now, let's just close it or let the state update handle it
        // Actually, we should re-render the list when game state updates if the modal is open
    }
};

// --- Game Logic Functions ---

function attemptJoin(role) {
    const name = ui.playerNameInput.value.trim();
    if (!name) {
        showToast('Please enter your name', 'error');
        return;
    }

    socket.emit('joinGame', { name, role, avatarSeed: currentAvatarSeed });
}

function submitAnswer() {
    const answer = ui.answerInput.value.trim();
    if (!answer) return;

    // Try to parse as number
    const numAnswer = parseFloat(answer);
    
    // Client-side validation: Answer must be a number
    if (isNaN(numAnswer)) {
        showToast('Answer must be a number', 'error');
        // Do NOT hide controls, allow user to correct
        return;
    }

    const finalAnswer = numAnswer;

    socket.emit('submitFinalAnswer', finalAnswer);
    ui.answerInput.value = '';
    // ui.answerControls.classList.add('hidden'); // Don't hide completely, just input/submit
    ui.answerInput.classList.add('hidden');
    ui.submitAnswerBtn.classList.add('hidden');
    
    // Show reveal button
    const revealBtn = document.getElementById('revealMyAnswerBtn');
    if (revealBtn) {
        revealBtn.classList.remove('hidden');
        revealBtn.disabled = false;
    }
    
    showToast('Answer submitted!', 'success');
}

function sendAction(action, amount = 0) {
    socket.emit('playerAction', { action, amount });
}

function handleQuickBet(type, action) {
    if (action === 'all-in') {
        // Calculate all-in (need balance from gameState)
        const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players);
        const meObj = playersList.find(p => p.id === myPlayer.id || p.name === myPlayer.name);
        
        if (meObj) ui.betInput.value = meObj.balance;
    } else if (type === 'min') {
        ui.betInput.value = gameState.minBet || 20;
    } else if (type === 'half') {
        ui.betInput.value = Math.floor(gameState.pot / 2);
    } else if (type === 'pot') {
        ui.betInput.value = gameState.pot;
    }
}

// --- UI Rendering ---

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
    screens[screenName].classList.add('active');

    if (screenName === 'game') {
        // Show/Hide Host Controls
        if (myPlayer.role === 'host') {
            ui.hostControls.classList.remove('hidden');
            ui.playerControls.classList.add('hidden');
        } else {
            ui.hostControls.classList.add('hidden');
            // Player controls visibility depends on phase
        }
    }
}

function renderGameState() {
    // Update Header
    if (gameState.state) {
        ui.phaseDisplay.textContent = gameState.state;
    }
    if (gameState.pot !== undefined) {
        ui.potAmount.textContent = gameState.pot;
    }

    // Update My Profile
    updateMyProfileDisplay();

    // Render Seats
    renderSeats();

    // Update Controls Visibility based on Phase & Turn
    updateControls();

    // Update Question/Hints
    if (gameState.currentQuestion) {
        showQuestion(gameState.currentQuestion.question);
    }
    
    // Show and render revealed hints
    if (gameState.revealedHints && gameState.revealedHints.length > 0) {
        ui.hintsDisplay.classList.remove('hidden');
        // Clear and rebuild to avoid duplicates and ensure correct state
        ui.hintsDisplay.innerHTML = '';
        gameState.revealedHints.forEach(hint => {
            const hintItem = document.createElement('div');
            hintItem.className = 'hint-item';
            hintItem.textContent = hint;
            ui.hintsDisplay.appendChild(hintItem);
        });
    } else if (gameState.state && gameState.state.includes('HINT_')) {
        // Show hints box even if no hints revealed yet (waiting for host)
        // But only if it's empty (don't show old hints)
        if (ui.hintsDisplay.innerHTML.trim() === '') {
            ui.hintsDisplay.classList.remove('hidden');
        }
    } else {
        // Hide and clear hints display if not in a hint phase and no hints revealed
        // This handles reset and new game scenarios
        if (gameState.state === 'WAITING' || gameState.state === 'ANSWERING' || !gameState.revealedHints || gameState.revealedHints.length === 0) {
            ui.hintsDisplay.classList.add('hidden');
            ui.hintsDisplay.innerHTML = '';
        }
    }
    
    // Update answer status for everyone
    updateAnswerStatus();

    // Update management list if open
    const playerManagementModal = document.getElementById('player-management-modal');
    if (playerManagementModal && !playerManagementModal.classList.contains('hidden')) {
        renderPlayerManagementList();
    }

    if (gameState.activePlayerSocketId) {
        FXManager.highlightTurn(gameState.activePlayerSocketId);
    }
}

function renderSeats() {
    ui.seatsContainer.innerHTML = '';

    // Convert players to array if object
    const playersList = Array.isArray(gameState.players)
        ? gameState.players
        : Object.values(gameState.players);

    // Filter out host if we don't want them in a seat (or keep them)
    // Typically host doesn't sit at the table in this game type? 
    // Let's assume only role='player' gets a seat.
    // Filter out host and invalid players - only players with role='player' and valid data get a seat
    const seatedPlayers = playersList.filter(p => {
        return p && p.role === 'player' && p.name && p.socketId;
    });
    
    console.log('Rendering seats:', { totalPlayers: playersList.length, seatedPlayers: seatedPlayers.length, players: seatedPlayers.map(p => ({ name: p.name, role: p.role, socketId: p.socketId })) });

    // Calculate positions around the oval table
    const playerCount = seatedPlayers.length;
    const centerX = 50; // Percentage from left
    const centerY = 50; // Percentage from top
    const radiusX = 42; // Horizontal radius for oval
    const radiusY = 35; // Vertical radius for oval
    
    seatedPlayers.forEach((player, index) => {
        const seatEl = document.createElement('div');
        const isActive = player.socketId === gameState.activePlayerSocketId;
        seatEl.className = `seat player-seat ${isActive ? 'active-turn' : ''} ${player.hasFolded ? 'folded' : ''}`;
        seatEl.dataset.id = player.socketId;
        seatEl.dataset.playerName = player.name;

        // Calculate angle for positioning around oval table
        // Distribute players evenly around the table
        const angle = (index / playerCount) * 2 * Math.PI - Math.PI / 2; // Start from top
        const x = centerX + radiusX * Math.cos(angle);
        const y = centerY + radiusY * Math.sin(angle);
        
        // Set position - use translate to center the seat
        seatEl.style.left = `${x}%`;
        seatEl.style.top = `${y}%`;
        seatEl.style.transform = `translate(-50%, -50%) ${isActive ? 'scale(1.15)' : 'scale(1)'}`;
        seatEl.style.position = 'absolute';

        // Get balance, default to 1000 if not set
        const balance = player.balance !== undefined ? player.balance : 1000;
        
        // Get current bet in round
        const currentBet = player.currentBetInRound || 0;
        const betDisplay = currentBet > 0 ? `<div class="player-bet">Bet: 🪙${currentBet}</div>` : '';
        
        // Show revealed answer if available
        const answerDisplay = player.finalAnswer !== undefined && player.finalAnswer !== null 
            ? `<div class="player-revealed-answer">Answer: ${player.finalAnswer}</div>` 
            : '';

        // Use avatarSeed if available, fallback to name
        const avatarSeed = player.avatarSeed || player.name;

        seatEl.innerHTML = `
            ${isActive ? '<div class="active-indicator">▶</div>' : ''}
            <div class="player-avatar">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}&backgroundColor=b6e3f4" alt="Avatar">
            </div>
            <div class="player-name">${player.name}</div>
            <div class="player-chips">🪙 ${balance}</div>
            ${betDisplay}
            ${answerDisplay}
            <div class="player-action-badge" id="badge-${player.name}"></div>
        `;

        ui.seatsContainer.appendChild(seatEl);
    });
}

function updateControls() {
    if (myPlayer.role === 'host') {
        // Host controls logic
        ui.startGameBtn.disabled = gameState.state !== 'WAITING' && gameState.state !== 'SHOWDOWN';
        // Enable hint button when in HINT_1 or HINT_2 phase
        const isHintPhase = gameState.state === 'HINT_1' || gameState.state === 'HINT_2';
        ui.revealHintBtn.disabled = !isHintPhase;
        
        // Enable reveal answer button when in ANSWER_REVEAL phase
        if (ui.revealAnswerBtn) {
            ui.revealAnswerBtn.disabled = gameState.state !== 'ANSWER_REVEAL';
        }
        
        // Enable showdown button ONLY when state is SHOWDOWN
        // The server sets state to SHOWDOWN when all rounds are done or all-in
        ui.startShowdownBtn.disabled = gameState.state !== 'SHOWDOWN';

        // Enable Next Question button only when waiting for next round (after showdown)
        if (ui.nextQuestionBtn) {
            ui.nextQuestionBtn.disabled = gameState.state !== 'WAITING';
        }

        // Enable Skip Question button only during ANSWERING phase
        if (ui.skipQuestionBtn) {
            ui.skipQuestionBtn.disabled = gameState.state !== 'ANSWERING';
        }
        return;
    }

    // Player Controls
    const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players || {});
    const me = playersList.find(p => p.id === myPlayer.id || p.name === myPlayer.name);

    // Show answer controls during ANSWERING phase
    if (gameState.state === 'ANSWERING') {
        ui.playerControls.classList.add('hidden');
        ui.answerControls.classList.remove('hidden');
    }
    // Show betting controls during BETTING phases
    else if (gameState.state && gameState.state.includes('BETTING')) {
        ui.answerControls.classList.add('hidden');

        const myTurn = me && me.socketId === gameState.activePlayerSocketId;
        if (myTurn && !me.hasFolded) {
            ui.playerControls.classList.remove('hidden');
        } else {
            ui.playerControls.classList.add('hidden');
        }
    }
    // Hide all controls in other states
    else {
        ui.playerControls.classList.add('hidden');
        ui.answerControls.classList.add('hidden');
        
        // Reset answer controls state for next round
        if (ui.answerInput) ui.answerInput.classList.remove('hidden');
        if (ui.submitAnswerBtn) ui.submitAnswerBtn.classList.remove('hidden');
        const revealBtn = document.getElementById('revealMyAnswerBtn');
        if (revealBtn) revealBtn.classList.add('hidden');
    }
}

function updateMyProfileDisplay() {
    ui.myPlayerNameDisplay.textContent = myPlayer.name;
    // Find my balance
    if (gameState.players) {
        const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players);
        const me = playersList.find(p => p.id === myPlayer.id || p.name === myPlayer.name);
        if (me) {
            ui.myPlayerChipsDisplay.textContent = me.balance;
        }
    }
}

function showQuestion(text) {
    ui.questionDisplay.classList.remove('hidden');
    // Clear any previous winner announcements or revealed answers
    const winnerAnnounce = ui.questionDisplay.querySelector('.winner-announce');
    if (winnerAnnounce) winnerAnnounce.remove();
    const revealedAnswer = ui.questionDisplay.querySelector('.revealed-answer');
    if (revealedAnswer) revealedAnswer.remove();
    
    ui.questionText.textContent = text;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    ui.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function updateConnectionStatus(connected) {
    ui.connectionStatus.classList.remove('hidden');
    if (connected) {
        ui.statusText.textContent = 'Connected';
        ui.connectionStatus.style.color = 'var(--accent-success)';
    } else {
        ui.statusText.textContent = 'Disconnected';
        ui.connectionStatus.style.color = 'var(--accent-danger)';
    }
}

function findSeatByPlayerName(name) {
    // Helper to find DOM element for animation
    const seats = document.querySelectorAll('.seat');
    for (let seat of seats) {
        if (seat.querySelector('.player-name').textContent === name) {
            return seat;
        }
    }
    return null;
}

function showActionBadge(seat, action) {
    const badge = seat.querySelector('.player-action-badge');
    if (badge) {
        badge.textContent = action;
        badge.classList.add('show');
        setTimeout(() => badge.classList.remove('show'), 2000);
    }
}

function updateAnswerStatus() {
    if (!ui.answerStatus || !ui.answerStatusList) return;
    
    if (gameState.state !== 'ANSWERING') {
        ui.answerStatus.classList.add('hidden');
        return;
    }
    
    ui.answerStatus.classList.remove('hidden');
    
    // Get all players
    const playersList = Array.isArray(gameState.players) 
        ? gameState.players 
        : Object.values(gameState.players || {});
    
    const playerPlayers = playersList.filter(p => p.role === 'player');
    
    ui.answerStatusList.innerHTML = '';
    
    playerPlayers.forEach(player => {
        const statusItem = document.createElement('div');
        statusItem.className = 'answer-status-item';
        
        const hasAnswered = player.hasAnswered || (player.finalAnswer !== null && player.finalAnswer !== undefined);
        const statusIcon = hasAnswered ? '✅' : '⏳';
        const statusText = hasAnswered ? 'Answered' : 'Waiting...';
        
        // Only show answer if it's visible (e.g. for the player themselves or host if implemented)
        const showAnswer = player.finalAnswer !== undefined && player.finalAnswer !== null;
        const answerText = showAnswer ? ` (${player.finalAnswer})` : '';
        
        statusItem.innerHTML = `
            <span class="status-icon">${statusIcon}</span>
            <span class="status-name">${player.name}</span>
            <span class="status-text">${statusText}${answerText}</span>
        `;
        
        statusItem.classList.toggle('answered', hasAnswered);
        statusItem.classList.toggle('waiting', !hasAnswered);
        
        ui.answerStatusList.appendChild(statusItem);
    });
}