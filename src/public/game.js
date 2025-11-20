import { AudioManager } from './js/modules/AudioManager.js';
import { FXManager } from './js/modules/FXManager.js';
import { UIManager } from './js/modules/UIManager.js';

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

let currentAvatarSeed = localStorage.getItem('qp_avatar_seed') || Math.random().toString(36).substring(7);

// Initialize Managers
const audio = new AudioManager();
const fx = new FXManager(audio);

// DOM Elements mapping
const uiElements = {
    playerNameInput: document.getElementById('playerName'),
    joinGameBtn: document.getElementById('joinGameBtn'),
    hostGameBtn: document.getElementById('hostGameBtn'),
    toastContainer: document.getElementById('toast-container'),
    connectionStatus: document.getElementById('connection-status'),
    statusText: document.getElementById('status-text'),
    roomId: document.getElementById('roomId'),
    phaseDisplay: document.getElementById('phase-display'),
    minBetDisplay: document.getElementById('minBetDisplay'),
    myPlayerNameDisplay: document.getElementById('myPlayerNameDisplay'),
    myPlayerChipsDisplay: document.getElementById('myPlayerChipsDisplay'),
    potAmount: document.getElementById('pot-amount'),
    questionDisplay: document.getElementById('question-display'),
    questionText: document.getElementById('question-text'),
    hintsDisplay: document.getElementById('hints-display'),
    answerDisplay: document.getElementById('answer-display'),
    seatsContainer: document.getElementById('seats-container'),
    playerControls: document.getElementById('player-controls'),
    hostControls: document.getElementById('host-controls'),
    answerControls: document.getElementById('answer-controls'),
    betInput: document.getElementById('betInput'),
    answerInput: document.getElementById('answerInput'),
    foldBtn: document.getElementById('foldBtn'),
    callBtn: document.getElementById('callBtn'),
    raiseBtn: document.getElementById('raiseBtn'),
    submitAnswerBtn: document.getElementById('submitAnswerBtn'),
    startGameBtn: document.getElementById('startGameBtn'),
    revealHintBtn: document.getElementById('revealHintBtn'),
    revealAnswerBtn: document.getElementById('revealAnswerBtn'),
    startShowdownBtn: document.getElementById('startShowdownBtn'),
    nextQuestionBtn: document.getElementById('nextQuestionBtn'),
    skipQuestionBtn: document.getElementById('skipQuestionBtn'),
    answerStatus: document.getElementById('answer-status'),
    answerStatusList: document.getElementById('answer-status-list'),
    managePlayersBtn: document.getElementById('managePlayersBtn'),
    playerManagementModal: document.getElementById('player-management-modal'),
    closeManagementBtn: document.getElementById('closeManagementBtn')
};

const screens = {
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen')
};

const uiManager = new UIManager(uiElements, audio, fx);

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    if (myPlayer.name) {
        uiElements.playerNameInput.value = myPlayer.name;
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

    updateAvatarPreview();

    // Event Listeners
    uiElements.joinGameBtn.addEventListener('click', () => attemptJoin('player'));
    uiElements.hostGameBtn.addEventListener('click', () => attemptJoin('host'));

    const clearSessionBtn = document.getElementById('clearSessionBtn');
    if (clearSessionBtn) {
        clearSessionBtn.addEventListener('click', () => {
            localStorage.clear();
            location.reload();
        });
    }

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

    uiElements.startGameBtn.addEventListener('click', () => socket.emit('startGame'));
    uiElements.revealHintBtn.addEventListener('click', () => socket.emit('showHint'));
    if (uiElements.revealAnswerBtn) {
        uiElements.revealAnswerBtn.addEventListener('click', () => socket.emit('revealAnswer'));
    }
    uiElements.startShowdownBtn.addEventListener('click', () => socket.emit('startShowdown'));

    const resetGameBtn = document.getElementById('resetGameBtn');
    if (resetGameBtn) {
        resetGameBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the game? This will kick all players.')) {
                socket.emit('resetGame');
            }
        });
    }

    uiElements.submitAnswerBtn.addEventListener('click', submitAnswer);

    const revealMyAnswerBtn = document.getElementById('revealMyAnswerBtn');
    if (revealMyAnswerBtn) {
        revealMyAnswerBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reveal your answer to everyone?')) {
                socket.emit('revealMyAnswer');
                revealMyAnswerBtn.disabled = true;
            }
        });
    }

    uiElements.foldBtn.addEventListener('click', () => sendAction('fold'));
    uiElements.callBtn.addEventListener('click', () => sendAction('call'));
    uiElements.raiseBtn.addEventListener('click', () => {
        const amount = parseInt(uiElements.betInput.value);
        if (amount > 0) sendAction('raise', amount);
        else uiManager.showToast('Please enter a valid amount', 'error');
    });

    document.querySelectorAll('.poker-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.target.closest('.poker-chip');
            const type = target.dataset.amount;
            const action = target.dataset.action;
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

    if (uiElements.nextQuestionBtn) {
        uiElements.nextQuestionBtn.addEventListener('click', () => {
            socket.emit('nextRound');
        });
    }

    if (uiElements.skipQuestionBtn) {
        uiElements.skipQuestionBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to skip this question?')) {
                socket.emit('skipQuestion');
            }
        });
    }

    if (uiElements.managePlayersBtn) {
        uiElements.managePlayersBtn.addEventListener('click', () => {
            uiManager.renderPlayerManagementList(gameState);
            uiElements.playerManagementModal.classList.remove('hidden');
        });
    }

    if (uiElements.closeManagementBtn) {
        uiElements.closeManagementBtn.addEventListener('click', () => {
            uiElements.playerManagementModal.classList.add('hidden');
        });
    }

    if (uiElements.playerManagementModal) {
        uiElements.playerManagementModal.addEventListener('click', (e) => {
            if (e.target === uiElements.playerManagementModal) {
                uiElements.playerManagementModal.classList.add('hidden');
            }
        });
    }

    const blindsToggle = document.getElementById('blindsToggle');
    if (blindsToggle) {
        blindsToggle.addEventListener('change', (e) => {
            socket.emit('toggleBlinds', { enabled: e.target.checked });
        });
    }

    const decreaseBetBtn = document.getElementById('decreaseBetBtn');
    const increaseBetBtn = document.getElementById('increaseBetBtn');

    if (decreaseBetBtn) {
        decreaseBetBtn.addEventListener('click', () => {
            let current = parseInt(uiElements.betInput.value) || 0;
            uiElements.betInput.value = Math.max(0, current - 10);
        });
    }

    if (increaseBetBtn) {
        increaseBetBtn.addEventListener('click', () => {
            let current = parseInt(uiElements.betInput.value) || 0;
            uiElements.betInput.value = current + 10;
        });
    }
});

// --- Socket Events ---

socket.on('connect', () => {
    uiManager.updateConnectionStatus(true);
    myPlayer.id = socket.id;
});

socket.on('disconnect', () => {
    uiManager.updateConnectionStatus(false);
});

socket.on('sessionRestored', (data) => {
    console.log('Session restored:', data);
    localStorage.setItem('qp_token', data.token);
    localStorage.setItem('qp_name', data.name);
    myPlayer.name = data.name;
    myPlayer.role = data.role;
    uiManager.showScreen('game', screens, myPlayer.role);
    uiManager.updateMyProfileDisplay(gameState, myPlayer);
    uiManager.showToast('Session restored!', 'success');
});

socket.on('sessionCreated', (data) => {
    console.log('Session created:', data);
    localStorage.setItem('qp_token', data.token);
    localStorage.setItem('qp_name', data.name);
    myPlayer.name = data.name;
    myPlayer.role = data.role;
    uiManager.showScreen('game', screens, myPlayer.role);
    uiManager.updateMyProfileDisplay(gameState, myPlayer);
});

socket.on('gameState', (state) => {
    console.log('Game State:', state);
    gameState = state;
    uiManager.renderGameState(gameState, myPlayer);
});

socket.on('playerJoined', (state) => {
    gameState = state;
    uiManager.renderGameState(gameState, myPlayer);
    uiManager.showToast('A player joined the game', 'success');
});

socket.on('errorMessage', (msg) => {
    uiManager.showToast(msg, 'error');
    audio.playError();
    fx.shake(document.body);
});

socket.on('activePlayerChanged', (data) => {
    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }
    if (data.activePlayer === myPlayer.name) {
        audio.playTurn();
        uiManager.showToast("It's your turn!", 'warning');
    }
});

socket.on('nextRoundReady', (data) => {
    uiManager.showToast('Next Round Starting...', 'info');

    if (uiElements.hintsDisplay) {
        uiElements.hintsDisplay.innerHTML = '';
        uiElements.hintsDisplay.classList.add('hidden');
    }

    if (uiElements.answerDisplay) {
        uiElements.answerDisplay.innerHTML = '';
        uiElements.answerDisplay.classList.add('hidden');
    }

    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }
});

socket.on('gameStarted', (data) => {
    uiManager.showToast('Game Started!', 'success');
    audio.playStart();

    if (uiElements.questionDisplay) {
        const winnerAnnounce = uiElements.questionDisplay.querySelector('.winner-announce');
        if (winnerAnnounce) winnerAnnounce.remove();
        const revealedAnswer = uiElements.questionDisplay.querySelector('.revealed-answer');
        if (revealedAnswer) revealedAnswer.remove();
    }

    if (uiElements.hintsDisplay) {
        uiElements.hintsDisplay.innerHTML = '';
        uiElements.hintsDisplay.classList.add('hidden');
    }

    if (uiElements.answerDisplay) {
        uiElements.answerDisplay.innerHTML = '';
        uiElements.answerDisplay.classList.add('hidden');
    }

    if (data.question) {
        uiManager.showQuestion(data.question);
    }

    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }
});

socket.on('bettingRoundStarted', (data) => {
    uiManager.showToast(`Betting Round ${data.round} Started!`, 'info');
    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }
    if (data.activePlayer === myPlayer.name) {
        audio.playTurn();
    }
});

socket.on('playerAction', (data) => {
    const actionMsg = `${data.player} ${data.action}s ${data.amount ? data.amount : ''}`;
    uiManager.showToast(actionMsg, 'info');

    if (data.action === 'fold') audio.playFold();
    else {
        const seat = uiManager.findSeatByPlayerName(data.player);
        if (seat && (data.action === 'call' || data.action === 'raise' || data.action === 'bet')) {
            fx.animateChips(seat, uiElements.potAmount);
        } else {
            audio.playChip();
        }
    }

    const seat = uiManager.findSeatByPlayerName(data.player);
    if (seat) uiManager.showActionBadge(seat, data.action);

    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }
});

socket.on('playerRevealedAnswer', (data) => {
    uiManager.showToast('A player revealed their answer!', 'warning');
    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }
});

socket.on('answerSubmitted', (data) => {
    if (myPlayer.role === 'host') {
        uiManager.showToast(`${data.player} submitted an answer.`, 'info');
        uiManager.updateAnswerStatus(gameState);
    }
});

socket.on('playerAnswered', (data) => {
    if (gameState.players) {
        const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players);
        const player = playersList.find(p => p.id === data.playerId || p.socketId === data.playerId);
        if (player) {
            player.hasAnswered = true;
            uiManager.updateAnswerStatus(gameState);
        }
    }
});

socket.on('hintRevealed', (data) => {
    uiManager.showToast(`Hint Revealed!`, 'warning');
    const hintBox = uiElements.hintsDisplay;
    hintBox.classList.remove('hidden');

    const hintItem = document.createElement('div');
    hintItem.className = 'hint-item';
    hintItem.innerHTML = `
        <span class="hint-label">Hint ${data.hintsRemaining !== undefined ? (3 - data.hintsRemaining) : ''}</span>
        <div class="hint-text">${data.hint}</div>
    `;
    hintBox.appendChild(hintItem);

    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }
});

socket.on('enableHintButton', (data) => {
    if (myPlayer.role === 'host') {
        uiElements.revealHintBtn.disabled = !data.enabled;
    }
});

socket.on('enableRevealAnswerButton', (data) => {
    if (myPlayer.role === 'host' && uiElements.revealAnswerBtn) {
        uiElements.revealAnswerBtn.disabled = !data.enabled;
    }
});

socket.on('answerRevealed', (data) => {
    uiManager.showToast(data.message, 'warning');

    const answerBox = uiElements.answerDisplay;
    if (answerBox) {
        answerBox.classList.remove('hidden');
        answerBox.innerHTML = `
            <span class="answer-label">ANSWER:</span>
            <div class="answer-text">${data.answer}</div>
        `;
    }

    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }
});

socket.on('enableShowdownButton', (data) => {
    if (myPlayer.role === 'host') {
        uiElements.startShowdownBtn.disabled = !data.enabled;
    }
});

socket.on('showdown', (data) => {
    uiManager.showToast(`Showdown! Winner: ${data.winnerName}`, 'success');
    audio.playWin();
    fx.confetti();

    uiElements.questionDisplay.innerHTML += `
        <div class="winner-announce">
            <h4>Winner: ${data.winnerName}</h4>
            <p>Correct Answer: ${data.correctAnswer}</p>
        </div>
    `;

    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }
});

socket.on('showdownResults', (data) => {
    console.log('Showdown Results:', data);
    if (data.gameState) {
        gameState = data.gameState;
        uiManager.renderGameState(gameState, myPlayer);
    }

    let winnerText = data.winners.map(w => w.name).join(', ');
    uiManager.showToast(`Winner(s): ${winnerText}`, 'success');
    audio.playWin();
    fx.confetti();

    uiElements.questionDisplay.innerHTML = `
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
    uiManager.showToast(data.message, 'warning');

    if (uiElements.hintsDisplay) {
        uiElements.hintsDisplay.innerHTML = '';
        uiElements.hintsDisplay.classList.add('hidden');
    }

    if (uiElements.answerDisplay) {
        uiElements.answerDisplay.innerHTML = '';
        uiElements.answerDisplay.classList.add('hidden');
    }

    if (uiElements.answerStatus) {
        uiElements.answerStatus.classList.add('hidden');
        if (uiElements.answerStatusList) {
            uiElements.answerStatusList.innerHTML = '';
        }
    }

    localStorage.clear();
    setTimeout(() => {
        location.reload();
    }, 2000);
});

socket.on('kicked', (data) => {
    alert(data.message || 'You have been kicked from the game.');
    localStorage.removeItem('qp_token');
    localStorage.removeItem('qp_name');
    location.reload();
});

socket.on('blindsIncreased', (data) => {
    uiManager.showToast(data.message, 'warning');
    audio.playTurn();
    if (data.newMinBet) {
        uiElements.minBetDisplay.textContent = data.newMinBet;
    }
});

socket.on('blindsStateChanged', (data) => {
    const blindsToggle = document.getElementById('blindsToggle');
    if (blindsToggle) {
        blindsToggle.checked = data.enabled;
    }
    if (data.minimumRaise) {
        uiElements.minBetDisplay.textContent = data.minimumRaise;
    }
    uiManager.showToast(`Blinds ${data.enabled ? 'Enabled' : 'Disabled'}`, 'info');
});

// --- Global Functions for UI Interaction ---

window.adjustBalance = (targetId, amount) => {
    socket.emit('adjustBalance', { targetId, amount });
};

window.kickPlayer = (targetId, name) => {
    if (confirm(`Are you sure you want to kick ${name}?`)) {
        socket.emit('kickPlayer', { targetId });
    }
};

// --- Game Logic Functions ---

function attemptJoin(role) {
    const name = uiElements.playerNameInput.value.trim();
    if (!name) {
        uiManager.showToast('Please enter your name', 'error');
        return;
    }

    socket.emit('joinGame', { name, role, avatarSeed: currentAvatarSeed });
}

function submitAnswer() {
    const answer = uiElements.answerInput.value.trim();
    if (!answer) return;

    const numAnswer = parseFloat(answer);

    if (isNaN(numAnswer)) {
        uiManager.showToast('Answer must be a number', 'error');
        return;
    }

    const finalAnswer = numAnswer;

    socket.emit('submitFinalAnswer', finalAnswer);
    uiElements.answerInput.value = '';
    uiElements.answerInput.classList.add('hidden');
    uiElements.submitAnswerBtn.classList.add('hidden');

    const revealBtn = document.getElementById('revealMyAnswerBtn');
    if (revealBtn) {
        revealBtn.classList.remove('hidden');
        revealBtn.disabled = false;
    }

    uiManager.showToast('Answer submitted!', 'success');
}

function sendAction(action, amount = 0) {
    socket.emit('playerAction', { action, amount });
}

function handleQuickBet(type, action) {
    if (action === 'all-in') {
        const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players);
        const meObj = playersList.find(p => p.id === myPlayer.id || p.name === myPlayer.name);

        if (meObj) uiElements.betInput.value = meObj.balance;
    } else if (type === 'min') {
        uiElements.betInput.value = gameState.minimumRaise || 20;
    } else if (type === 'half') {
        uiElements.betInput.value = Math.floor(gameState.pot / 2);
    } else if (type === 'pot') {
        uiElements.betInput.value = gameState.pot;
    }
}