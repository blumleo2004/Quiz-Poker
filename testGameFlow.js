const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3000';

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
    console.log('🎮 Starting Complete Game Flow Test\n');

    const host = createClient(null, 'Host');
    const alice = createClient(null, 'Alice');
    const bob = createClient(null, 'Bob');
    const clients = { 'Host': host, 'Alice': alice, 'Bob': bob };

    let gameState = { state: 'WAITING' };
    let showdownReceived = false;

    const handleStateUpdate = (client, state) => {
        gameState = state;
        console.log(`📊 ${client.playerName} state update: ${state.state}`);
    };

    // Function to check if it's my turn and act
    const checkTurnAndAct = async (clientName, activePlayerName) => {
        if (clientName === activePlayerName) {
            console.log(`👉 It's ${clientName}'s turn. Calling...`);
            await new Promise(r => setTimeout(r, 500)); // Think time
            clients[clientName].emit('playerAction', { action: 'call', amount: 0 });
        }
    };

    [host, alice, bob].forEach(client => {
        client.on('connect', () => console.log(`🔌 ${client.playerName} connected`));
        client.on('sessionCreated', (data) => console.log(`✅ ${client.playerName}: Session created (${data.role})`));
        client.on('gameState', (state) => handleStateUpdate(client, state));

        client.on('gameStarted', (data) => {
            console.log(`🎯 ${client.playerName}: Game Started! Question: "${data.question}"`);
            if (data.gameState) handleStateUpdate(client, data.gameState);
        });

        client.on('bettingRoundStarted', (data) => {
            console.log(`💰 ${client.playerName}: Betting Round ${data.round} started. Active: ${data.activePlayer}`);
            checkTurnAndAct(client.playerName, data.activePlayer);
        });

        client.on('activePlayerChanged', (data) => {
            console.log(`👉 ${client.playerName} sees active player changed to: ${data.activePlayer}`);
            checkTurnAndAct(client.playerName, data.activePlayer);
        });

        client.on('playerAction', (data) => {
            console.log(`🎲 ${client.playerName} saw: ${data.player} ${data.action} ${data.amount || ''}`);
            if (data.gameState) handleStateUpdate(client, data.gameState);
        });

        client.on('nextBettingRoundReady', (data) => {
            console.log(`💡 ${client.playerName}: Next round ready - ${data.message}`);
            if (client.playerName === 'Host') {
                console.log(`   Host will show hint in 1 second...`);
                setTimeout(() => {
                    console.log(`   🎁 Host showing hint...`);
                    host.emit('showHint');
                }, 1000);
            }
        });

        client.on('hintShown', (data) => {
            console.log(`💡 ${client.playerName}: Hint shown: "${data.hint}"`);
            if (data.gameState) handleStateUpdate(client, data.gameState);
        });

        client.on('bettingComplete', (data) => {
            console.log(`🏁 ${client.playerName}: Betting complete - ${data.message}`);
            if (client.playerName === 'Host') {
                console.log(`   Host will start showdown in 1 second...`);
                setTimeout(() => {
                    console.log(`   🎭 Host starting showdown...`);
                    host.emit('startShowdown');
                }, 1000);
            }
        });

        client.on('showdownResults', (data) => {
            console.log(`🏆 ${client.playerName}: Showdown Results!`);
            console.log(`   Winners: ${data.winners.map(w => w.name).join(', ')}`);
            console.log(`   Correct Answer: ${data.correctAnswer}`);
            console.log(`   Final Answers: ${JSON.stringify(data.finalAnswers)}`);
            if (client.playerName === 'Host') {
                showdownReceived = true;
            }
        });

        client.on('errorMessage', (msg) => console.error(`❌ ${client.playerName} Error: ${msg}`));
    });

    // --- Simulation Steps ---

    await new Promise(r => setTimeout(r, 1000));

    console.log('\n1️⃣ Joining Game...');
    host.emit('joinGame', { name: 'Host', role: 'host' });
    await new Promise(r => setTimeout(r, 500));
    alice.emit('joinGame', { name: 'Alice', role: 'player' });
    await new Promise(r => setTimeout(r, 500));
    bob.emit('joinGame', { name: 'Bob', role: 'player' });

    await new Promise(r => setTimeout(r, 2000));

    console.log('\n2️⃣ Starting Game...');
    host.emit('startGame');

    // Wait for ANSWERING phase
    console.log('⏳ Waiting for ANSWERING phase...');
    await new Promise(resolve => {
        const check = setInterval(() => {
            if (gameState.state === 'ANSWERING') {
                clearInterval(check);
                resolve();
            }
        }, 100);
        setTimeout(() => {
            clearInterval(check);
            console.error('❌ Timeout waiting for ANSWERING phase');
            process.exit(1);
        }, 10000);
    });

    console.log('✅ Game started (ANSWERING)!');
    console.log('\n3️⃣ Submitting answers...');
    alice.emit('submitFinalAnswer', 42);
    await new Promise(resolve => setTimeout(resolve, 200));
    bob.emit('submitFinalAnswer', 100);

    console.log('\n4️⃣ Waiting for game to complete automatically...');

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error(`❌ Timeout - Final state: ${gameState.state}`);
            reject(new Error('Timeout waiting for showdown to complete'));
        }, 30000); // Increased timeout for full game

        const checkShowdown = setInterval(() => {
            if (showdownReceived) {
                clearTimeout(timeout);
                clearInterval(checkShowdown);
                console.log('\n✅ Showdown completed successfully!');
                setTimeout(resolve, 1000); // Give time for cleanup
            }
        }, 500);
    });

    console.log('\n🏁 Test completed successfully - Full game cycle complete!');
    process.exit(0);
}

testCompleteGame().catch(err => {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
});
