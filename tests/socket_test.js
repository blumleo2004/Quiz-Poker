const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3000';

const createClient = (token) => {
    return io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true
    });
};

async function runTests() {
    console.log('Starting Socket Tests...');

    // Test 1: Join Game and get Token
    console.log('\nTest 1: Join Game');
    const client1 = createClient(null);

    await new Promise((resolve) => {
        client1.on('connect', () => {
            console.log('Client 1 connected');
            client1.emit('joinGame', { name: 'TestPlayer1', role: 'player' });
        });

        client1.on('sessionCreated', (data) => {
            console.log('Session created:', data);
            if (data.name === 'TestPlayer1' && data.token) {
                console.log('✅ Test 1 Passed: Session created with token');
                client1.token = data.token;
                resolve();
            }
        });
    });

    // Test 2: Reconnect with Token
    console.log('\nTest 2: Reconnect with Token');
    client1.disconnect();

    const client1Reconnected = createClient(client1.token);

    await new Promise((resolve) => {
        client1Reconnected.on('connect', () => {
            // Emit joinGame again to simulate page reload logic
            client1Reconnected.emit('joinGame', { name: 'IgnoredName', role: 'player' });
        });

        client1Reconnected.on('gameState', (state) => {
            // If we get gameState, it means we joined successfully
            console.log('✅ Test 2 Passed: Reconnected and received game state');
            resolve();
        });

        client1Reconnected.on('sessionCreated', (data) => {
            if (data.token === client1.token) {
                console.log('✅ Received session details on reconnection (UI fix)');
            } else {
                console.error('❌ Test 2 Failed: Created NEW session instead of restoring');
            }
        });
    });

    // Test 3: Invalid Input Validation
    console.log('\nTest 3: Invalid Input');
    const client2 = createClient(null);

    await new Promise((resolve) => {
        client2.on('connect', () => {
            client2.emit('joinGame', { name: 'A', role: 'player' }); // Too short
        });

        client2.on('errorMessage', (msg) => {
            console.log(`Received expected error: ${msg}`);
            if (msg.includes('Name muss mindestens 2 Zeichen lang sein')) {
                console.log('✅ Test 3 Passed: Validation error received');
                resolve();
            }
        });
    });

    console.log('\nAll Tests Completed.');
    process.exit(0);
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
