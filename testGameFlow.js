const io = require('socket.io-client');
const fs = require('fs');

const SOCKET_URL = 'http://localhost:3000';
const LOG_FILE = 'test_debug_log.txt';

function log(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    console.log(msg);
    fs.appendFileSync(LOG_FILE, logMsg);
}

// Clear log file
fs.writeFileSync(LOG_FILE, '');

const createClient = (token, name) => {
    const client = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true
    });
    client.playerName = name;
    return client;
};

async function testCompleteGame() {
    log('🎮 Starting Complete Game Flow Test');

    const host = createClient(null, 'Host');
    const alice = createClient(null, 'Alice');
    const bob = createClient(null, 'Bob');
    const clients = { 'Host': host, 'Alice': alice, 'Bob': bob };

    let gameState = { state: 'WAITING' };
    let showdownReceived = false;

    const handleStateUpdate = (client, state) => {
        gameState = state;
        log(`📊 ${client.playerName} state update: ${state.state}`);
    };

    // Function to check if it's my turn and act
    const checkTurnAndAct = async (clientName, activePlayerName) => {
        if (clientName === activePlayerName) {
            log(`👉 It's ${clientName}'s turn. Calling...`);
            await new Promise(r => setTimeout(r, 500)); // Think time
            clients[clientName].emit('playerAction', { action: 'call', amount: 0 });
        }
    };

    [host, alice, bob].forEach(client => {
        client.on('connect', () => log(`🔌 ${client.playerName} connected`));
        client.on('sessionCreated', (data) => log(`✅ ${client.playerName}: Session created (${data.role})`));
        client.on('gameState', (state) => handleStateUpdate(client, state));

        client.on('gameStarted', (data) => {
            log(`🎯 ${client.playerName}: Game Started! Question: "${data.question}"`);
            if (data.gameState) handleStateUpdate(client, data.gameState);
        });

        client.on('bettingRoundStarted', (data) => {
            log(`💰 ${client.playerName}: Betting Round ${data.round} started. Active: ${data.activePlayer}`);
            checkTurnAndAct(client.playerName, data.activePlayer);
        });

        client.on('activePlayerChanged', (data) => {
            log(`👉 ${client.playerName} sees active player changed to: ${data.activePlayer}`);
            checkTurnAndAct(client.playerName, data.activePlayer);
        });

        client.on('playerAction', (data) => {
            log(`🎲 ${client.playerName} saw: ${data.player} ${data.action} ${data.amount || ''}`);
            if (data.gameState) handleStateUpdate(client, data.gameState);
        });

        client.on('nextBettingRoundReady', (data) => {
            log(`💡 ${client.playerName}: Next round ready - ${data.message}`);
            if (client.playerName === 'Host') {
                log(`   Host will show hint in 1 second...`);
                setTimeout(() => {
                    log(`   🎁 Host showing hint...`);
                    host.emit('showHint');
                }, 1000);
            }
        });

        client.on('hintShown', (data) => {
            log(`💡 ${client.playerName}: Hint shown: "${data.hint}"`);
            if (data.gameState) handleStateUpdate(client, data.gameState);
        });

        client.on('bettingComplete', (data) => {
            log(`🏁 ${client.playerName}: Betting complete - ${data.message}`);
            if (client.playerName === 'Host') {
                log(`   Host will start showdown in 1 second...`);
                setTimeout(() => {
                    log(`   🎭 Host starting showdown...`);
                    host.emit('startShowdown');
                }, 1000);
            }
        });

        client.on('showdownResults', (data) => {
            log(`🏆 ${client.playerName}: Showdown Results!`);
            log(`   Winners: ${data.winners.map(w => w.name).join(', ')}`);
            log(`   Correct Answer: ${data.correctAnswer}`);
            log(`   Final Answers: ${JSON.stringify(data.finalAnswers)}`);
            if (client.playerName === 'Host') {
                showdownReceived = true;
            }
        });

        client.on('errorMessage', (msg) => log(`❌ ${client.playerName} Error: ${msg}`));
    });

    // --- Simulation Steps ---

    await new Promise(r => setTimeout(r, 1000));

    log('1️⃣ Joining Game...');
    host.emit('joinGame', { name: 'Host', role: 'host' });
    await new Promise(r => setTimeout(r, 500));
    alice.emit('joinGame', { name: 'Alice', role: 'player' });
    await new Promise(r => setTimeout(r, 500));
    bob.emit('joinGame', { name: 'Bob', role: 'player' });

    await new Promise(r => setTimeout(r, 2000));

    log('2️⃣ Starting Game...');
    host.emit('startGame');

    // Wait for ANSWERING phase
    log('⏳ Waiting for ANSWERING phase...');
    await new Promise((resolve, reject) => {
        let timeout;
        const check = setInterval(() => {
            if (gameState.state === 'ANSWERING') {
                clearInterval(check);
                clearTimeout(timeout);
                resolve();
            }
        }, 100);
        timeout = setTimeout(() => {
            clearInterval(check);
            log('❌ Timeout waiting for ANSWERING phase');
            // process.exit(1); // Don't exit here, reject promise
            reject(new Error('Timeout waiting for ANSWERING phase'));
        }, 10000);
    });

    log('✅ Game started (ANSWERING)!');
    log('3️⃣ Submitting answers...');
    alice.emit('submitFinalAnswer', 42);
    await new Promise(resolve => setTimeout(resolve, 200));
    bob.emit('submitFinalAnswer', 100);

    log('4️⃣ Waiting for game to complete automatically...');

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            log(`❌ Timeout - Final state: ${gameState.state}`);
            reject(new Error('Timeout waiting for showdown to complete'));
        }, 30000); // Increased timeout for full game

        const checkShowdown = setInterval(() => {
            if (showdownReceived) {
                clearTimeout(timeout);
                clearInterval(checkShowdown);
                log('✅ Showdown completed successfully!');
                setTimeout(resolve, 1000); // Give time for cleanup
            }
        }, 500);
    });

    log('🏁 Test completed successfully - Full game cycle complete!');
    process.exit(0);
}

testCompleteGame().catch(err => {
    log(`❌ Test failed: ${err.message}`);
    process.exit(1);
});
