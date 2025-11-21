export class UIManager {
    constructor(uiElements, audioManager, fxManager) {
        this.ui = uiElements;
        this.audio = audioManager;
        this.fx = fxManager;
    }

    showScreen(screenName, screens, myPlayerRole) {
        Object.values(screens).forEach(s => s.classList.add('hidden'));
        screens[screenName].classList.remove('hidden');
        screens[screenName].classList.add('active');

        if (screenName === 'game') {
            if (myPlayerRole === 'host') {
                this.ui.hostControls.classList.remove('hidden');
                this.ui.playerControls.classList.add('hidden');
            } else {
                this.ui.hostControls.classList.add('hidden');
            }
        }
    }

    updateConnectionStatus(connected) {
        this.ui.connectionStatus.classList.remove('hidden');
        if (connected) {
            this.ui.statusText.textContent = 'Connected';
            this.ui.connectionStatus.style.color = 'var(--accent-success)';
        } else {
            this.ui.statusText.textContent = 'Disconnected';
            this.ui.connectionStatus.style.color = 'var(--accent-danger)';
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.ui.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    showQuestion(text) {
        if (!text) return;
        this.ui.questionDisplay.classList.remove('hidden');
        const winnerAnnounce = this.ui.questionDisplay.querySelector('.winner-announce');
        if (winnerAnnounce) winnerAnnounce.remove();
        const revealedAnswer = this.ui.questionDisplay.querySelector('.revealed-answer');
        if (revealedAnswer) revealedAnswer.remove();
        this.ui.questionText.textContent = text;
    }

    renderGameState(gameState, myPlayer) {
        // Header
        if (gameState.state) this.ui.phaseDisplay.textContent = gameState.state;
        if (gameState.minimumRaise) this.ui.minBetDisplay.textContent = gameState.minimumRaise;
        if (gameState.pot !== undefined) this.ui.potAmount.textContent = gameState.pot;

        this.updateMyProfileDisplay(gameState, myPlayer);
        this.renderSeats(gameState);
        this.updateControls(gameState, myPlayer);

        // Question/Hints
        if (gameState.currentQuestion) this.showQuestion(gameState.currentQuestion.question);

        // Hints
        if (gameState.revealedHints && gameState.revealedHints.length > 0) {
            this.ui.hintsDisplay.classList.remove('hidden');
            this.ui.hintsDisplay.innerHTML = '';
            gameState.revealedHints.forEach((hint, index) => {
                const hintItem = document.createElement('div');
                hintItem.className = 'hint-item';
                hintItem.innerHTML = `<span class="hint-label">Hint ${index + 1}</span><div class="hint-text">${hint}</div>`;
                this.ui.hintsDisplay.appendChild(hintItem);
            });
        } else if (gameState.state && gameState.state.includes('HINT_')) {
            if (this.ui.hintsDisplay.innerHTML.trim() === '') this.ui.hintsDisplay.classList.remove('hidden');
        } else {
            if (gameState.state === 'WAITING' || gameState.state === 'ANSWERING' || !gameState.revealedHints || gameState.revealedHints.length === 0) {
                this.ui.hintsDisplay.classList.add('hidden');
                this.ui.hintsDisplay.innerHTML = '';
            }
        }

        // Correct Answer
        if (gameState.correctAnswer && (gameState.state === 'ANSWER_REVEAL' || gameState.state === 'SHOWDOWN' || gameState.state === 'BETTING_ROUND_4')) {
            if (this.ui.answerDisplay) {
                this.ui.answerDisplay.classList.remove('hidden');
                this.ui.answerDisplay.innerHTML = `<span class="answer-label">ANSWER:</span><div class="answer-text">${gameState.correctAnswer}</div>`;
            }
        } else {
            if (this.ui.answerDisplay) {
                this.ui.answerDisplay.classList.add('hidden');
                this.ui.answerDisplay.innerHTML = '';
            }
        }

        this.updateAnswerStatus(gameState);

        const playerManagementModal = document.getElementById('player-management-modal');
        if (playerManagementModal && !playerManagementModal.classList.contains('hidden')) {
            this.renderPlayerManagementList(gameState);
        }

        if (gameState.activePlayerSocketId) {
            this.fx.highlightTurn(gameState.activePlayerSocketId);
        }
    }

    updateMyProfileDisplay(gameState, myPlayer) {
        this.ui.myPlayerNameDisplay.textContent = myPlayer.name;
        if (gameState.players) {
            const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players);
            const me = playersList.find(p => p.id === myPlayer.id || p.name === myPlayer.name);
            if (me) this.ui.myPlayerChipsDisplay.textContent = me.balance;
        }
    }

    renderSeats(gameState) {
        this.ui.seatsContainer.innerHTML = '';
        const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players);
        const seatedPlayers = playersList.filter(p => p && p.role === 'player' && p.name && p.socketId);

        const playerCount = seatedPlayers.length;
        const centerX = 50;
        const centerY = 50;
        const radiusX = 42;
        const radiusY = 35;

        seatedPlayers.forEach((player, index) => {
            const seatEl = document.createElement('div');
            const isActive = player.socketId === gameState.activePlayerSocketId;
            const isEliminated = player.isEliminated;
            seatEl.className = `seat player-seat ${isActive ? 'active-turn' : ''} ${player.hasFolded ? 'folded' : ''} ${isEliminated ? 'eliminated' : ''}`;
            seatEl.dataset.id = player.socketId;
            seatEl.dataset.playerName = player.name;

            const angle = (index / playerCount) * 2 * Math.PI - Math.PI / 2;
            const x = centerX + radiusX * Math.cos(angle);
            const y = centerY + radiusY * Math.sin(angle);

            seatEl.style.left = `${x}%`;
            seatEl.style.top = `${y}%`;
            seatEl.style.transform = `translate(-50%, -50%) ${isActive ? 'scale(1.15)' : 'scale(1)'}`;
            seatEl.style.position = 'absolute';

            const balance = player.balance !== undefined ? player.balance : 1000;
            const currentBet = player.currentBetInRound || 0;
            const betDisplay = currentBet > 0 ? `<div class="player-bet">Bet: 🪙${currentBet}</div>` : '';
            const answerDisplay = player.finalAnswer !== undefined && player.finalAnswer !== null
                ? `<div class="player-revealed-answer">Answer: ${player.finalAnswer}</div>`
                : '';
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
            this.ui.seatsContainer.appendChild(seatEl);
        });
    }

    updateControls(gameState, myPlayer) {
        if (myPlayer.role === 'host') {
            this.ui.startGameBtn.disabled = gameState.state !== 'WAITING' && gameState.state !== 'SHOWDOWN';
            const isHintPhase = gameState.state === 'HINT_1' || gameState.state === 'HINT_2';
            this.ui.revealHintBtn.disabled = !isHintPhase;
            if (this.ui.revealAnswerBtn) this.ui.revealAnswerBtn.disabled = gameState.state !== 'ANSWER_REVEAL';
            this.ui.startShowdownBtn.disabled = gameState.state !== 'SHOWDOWN';
            if (this.ui.nextQuestionBtn) this.ui.nextQuestionBtn.disabled = gameState.state !== 'WAITING';
            if (this.ui.skipQuestionBtn) this.ui.skipQuestionBtn.disabled = gameState.state !== 'ANSWERING';
            return;
        }

        const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players || {});
        const me = playersList.find(p => p.id === myPlayer.id || p.name === myPlayer.name);

        if (gameState.state === 'ANSWERING') {
            this.ui.playerControls.classList.add('hidden');
            this.ui.answerControls.classList.remove('hidden');
        } else if (gameState.state && gameState.state.includes('BETTING')) {
            this.ui.answerControls.classList.add('hidden');
            const myTurn = me && me.socketId === gameState.activePlayerSocketId;
            if (myTurn && !me.hasFolded) {
                this.ui.playerControls.classList.remove('hidden');
            } else {
                this.ui.playerControls.classList.add('hidden');
            }
        } else {
            this.ui.playerControls.classList.add('hidden');
            this.ui.answerControls.classList.add('hidden');
            if (this.ui.answerInput) this.ui.answerInput.classList.remove('hidden');
            if (this.ui.submitAnswerBtn) this.ui.submitAnswerBtn.classList.remove('hidden');
            const revealBtn = document.getElementById('revealMyAnswerBtn');
            if (revealBtn) revealBtn.classList.add('hidden');
        }
    }

    updateAnswerStatus(gameState) {
        if (!this.ui.answerStatus || !this.ui.answerStatusList) return;
        if (gameState.state !== 'ANSWERING') {
            this.ui.answerStatus.classList.add('hidden');
            return;
        }
        this.ui.answerStatus.classList.remove('hidden');
        const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players || {});
        const playerPlayers = playersList.filter(p => p.role === 'player');
        this.ui.answerStatusList.innerHTML = '';

        playerPlayers.forEach(player => {
            const statusItem = document.createElement('div');
            statusItem.className = 'answer-status-item';
            const hasAnswered = player.hasAnswered || (player.finalAnswer !== null && player.finalAnswer !== undefined);
            const statusIcon = hasAnswered ? '✅' : '⏳';
            const statusText = hasAnswered ? 'Answered' : 'Waiting...';
            const showAnswer = player.finalAnswer !== undefined && player.finalAnswer !== null;
            const answerText = showAnswer ? ` (${player.finalAnswer})` : '';

            statusItem.innerHTML = `
                <span class="status-icon">${statusIcon}</span>
                <span class="status-name">${player.name}</span>
                <span class="status-text">${statusText}${answerText}</span>
            `;
            statusItem.classList.toggle('answered', hasAnswered);
            statusItem.classList.toggle('waiting', !hasAnswered);
            this.ui.answerStatusList.appendChild(statusItem);
        });
    }

    renderPlayerManagementList(gameState) {
        const listContainer = document.getElementById('management-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';
        const playersList = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players || {});
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

    showActionBadge(seat, action) {
        const badge = seat.querySelector('.player-action-badge');
        if (badge) {
            badge.textContent = action;
            badge.classList.add('show');
            setTimeout(() => badge.classList.remove('show'), 2000);
        }
    }

    findSeatByPlayerName(name) {
        const seats = document.querySelectorAll('.seat');
        for (let seat of seats) {
            if (seat.querySelector('.player-name').textContent === name) {
                return seat;
            }
        }
        return null;
    }
}
