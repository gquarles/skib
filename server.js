const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// --- GAME STATE ---
let players = {}; // { socketId: { name, score, id } }
let drawerId = null;
let currentWord = "";
let roundTime = 0;
let roundInterval = null;
let isGameRunning = false;
let guessedPlayers = []; // Track who guessed correctly this round
let currentRound = 0;
const TOTAL_ROUNDS = 5;
let currentOptions = [];
let customUsed = {}; // { socketId: boolean }
let hostId = null;
let playerOrder = [];
let revealedIndices = new Set();
let currentHintDisplay = "";
let pendingHintTimes = new Set();

const WORD_LIST = [
    "AIR", "ALARM", "ALBUM", "ALIEN", "ANCHOR", "ANGEL", "APPLE", "ARM", "ARMOR", "ARROW",
    "ART", "ATOM", "AVOCADO", "AXE", "BACKPACK", "BADGE", "BALLOON", "BANANA", "BAND", "BANK",
    "BARREL", "BASKET", "BATH", "BEACH", "BEAK", "BEAN", "BEARD", "BED", "BEE", "BELL",
    "BERRY", "BIKE", "BIRD", "BLANKET", "BLOOM", "BOAT", "BOLT", "BONE", "BOOK", "BOOT",
    "BOTTLE", "BOX", "BRACELET", "BRANCH", "BREAD", "BRIDGE", "BRUSH", "BUBBLE", "BUCKET", "BURGER",
    "BUTTON", "CABLE", "CAKE", "CAMERA", "CANDLE", "CANDY", "CANYON", "CAP", "CAPE", "CAR",
    "CARD", "CARROT", "CASTLE", "CAT", "CAVE", "CHAIR", "CHEESE", "CHEF", "CHERRY", "CHEST",
    "CLOCK", "CLOUD", "COAT", "COFFEE", "COIN", "COMET", "COMPASS", "COMPUTER", "COOKIE", "CORAL",
    "CORN", "CROWN", "CRYSTAL", "CUP", "DANCE", "DART", "DEER", "DESERT", "DIAMOND", "DISH",
    "DOG", "DOOR", "DRAGON", "DRUM", "DUCK", "EAGLE", "EAR", "EARTH", "EGG", "ENGINE",
    "EYE", "FAN", "FEATHER", "FENCE", "FIRE", "FISH", "FLAG", "FLOWER", "FLUTE", "FOOD",
    "FOREST", "FORK", "FOX", "FRAME", "FRUIT", "GARDEN", "GATE", "GHOST", "GIFT", "GLASS",
    "GLOVE", "GOLD", "GRASS", "GRAPE", "GUITAR", "HAMMER", "HAT", "HEART", "HILL", "HONEY",
    "HOOK", "HOUSE", "ICE", "ISLAND", "JAR", "JEWEL", "JUNGLE", "KEY", "KITE", "KNIFE",
    "LADDER", "LAMP", "LANTERN", "LEAF", "LEMON", "LENS", "LETTER", "LIGHT", "LION", "LOCK",
    "MAP", "MASK", "MEDAL", "MELON", "MILK", "MIRROR", "MOON", "MOUSE", "MUSIC", "NEST",
    "NOSE", "OCEAN", "ONION", "ORANGE", "OWL", "PAINT", "PALM", "PAN", "PAPER", "PEACH",
    "PEAR", "PENCIL", "PENGUIN", "PEPPER", "PHONE", "PIANO", "PILLOW", "PINE", "PIRATE", "PIZZA",
    "PLANE", "PLANET", "PLANT", "PLATE", "PLUG", "POCKET", "POND", "POTATO", "PUMPKIN", "PUPPY",
    "QUEEN", "QUIET", "RAIN", "RAINBOW", "RING", "RIVER", "ROBOT", "ROCKET", "ROPE", "ROSE",
    "SADDLE", "SALAD", "SAND", "SCALE", "SCHOOL", "SCISSORS", "SEA", "SHEEP", "SHIP", "SHOE",
    "SHOP", "SHOWER", "SIGN", "SKATE", "SKY", "SLED", "SMILE", "SMOKE", "SNAIL", "SNOW",
    "SOCK", "SOUP", "SPIDER", "SPONGE", "SPOON", "STAR", "STONE", "STORE", "STREAM", "SUN",
    "SUSHI", "SWAN", "SWORD", "TABLE", "TAXI", "TEA", "TEETH", "TEMPLE", "TENT", "TIGER",
    "TOAST", "TOOTH", "TORCH", "TOWER", "TRAIN", "TREE", "TRUCK", "TURTLE", "UMBRELLA", "VASE",
    "VIOLIN", "WATER", "WHALE", "WHEEL", "WIND", "WINDOW", "WING", "WOLF", "WOOD", "YOGURT", "ZEBRA"
];

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. JOIN GAME
    socket.on('join_game', (name) => {
        players[socket.id] = {
            id: socket.id,
            name: name || `Guest ${socket.id.substr(0,4)}`,
            score: 0
        };
        customUsed[socket.id] = false;
        if (!playerOrder.includes(socket.id)) playerOrder.push(socket.id);
        if (!hostId) hostId = socket.id;
        
        // Broadcast updated player list
        io.emit('update_player_list', Object.values(players));
        emitHostUpdate();
        
        // Send current canvas state? (Advanced optimization omitted for simplicity, 
        // usually you'd store drawing history on server and replay it)
        
        // If first player, start game loop
        if (isGameRunning) {
             // Send current game state to late joiner
             socket.emit('round_start', { 
                 drawerId, 
                 word: currentHintDisplay || generateUnderscores(currentWord) 
             });
        }
    });

    socket.on('start_game', () => {
        if (socket.id !== hostId) return;
        if (isGameRunning) return;
        if (Object.keys(players).length < 2) {
            socket.emit('start_denied', "Need at least 2 players to start.");
            emitHostUpdate();
            return;
        }
        clearInterval(roundInterval);
        Object.values(players).forEach(p => { p.score = 0; });
        currentRound = 0;
        currentOptions = [];
        currentWord = "";
        currentHintDisplay = "";
        revealedIndices = new Set();
        pendingHintTimes = new Set();
        guessedPlayers = [];
        drawerId = null;
        roundTime = 0;
        resetCustomUsage();
        io.emit('update_player_list', Object.values(players));
        startNewRound();
        emitHostUpdate();
    });

    // 2. DRAWING EVENTS (Relay to others)
    socket.on('draw_line', (data) => {
        if (socket.id === drawerId) socket.broadcast.emit('draw_line', data);
    });
    socket.on('fill', (data) => {
        if (socket.id === drawerId) socket.broadcast.emit('fill', data);
    });
    socket.on('clear_canvas', () => {
        if (socket.id === drawerId) socket.broadcast.emit('clear_canvas');
    });
    socket.on('canvas_snapshot', (dataUrl) => {
        if (socket.id === drawerId) socket.broadcast.emit('canvas_snapshot', dataUrl);
    });

    // 3. WORD SELECTION
    socket.on('word_chosen', (word) => {
        if (socket.id !== drawerId) return;
        if (!currentOptions.length) return;
        const selected = String(word || "").toUpperCase();
        if (!currentOptions.includes(selected)) return;
        startRoundWithWord(selected);
    });

    socket.on('custom_word', (input) => {
        if (socket.id !== drawerId) return;
        if (!currentOptions.length) return;
        if (customUsed[socket.id]) {
            socket.emit('custom_unavailable', "Custom word already used this game.");
            io.to(drawerId).emit('choose_word', { words: currentOptions, canCustom: false });
            return;
        }

        const sanitized = sanitizeCustomWord(input);
        if (!sanitized) {
            socket.emit('custom_unavailable', "Custom word must be 1-50 characters (A-Z, 0-9, spaces).");
            io.to(drawerId).emit('choose_word', { words: currentOptions, canCustom: true });
            return;
        }

        customUsed[socket.id] = true;
        startRoundWithWord(sanitized);
    });

    // 4. CHAT & GUESSING
    socket.on('chat_message', (msg) => {
        const player = players[socket.id];
        if (!player) return;

        // If it's a correct guess
        if (isGameRunning && 
            socket.id !== drawerId && 
            msg.trim().toUpperCase() === currentWord && 
            !guessedPlayers.includes(socket.id)) {
            
            // Handle Correct Guess
            const points = Math.max(10, Math.ceil(roundTime / 2));
            player.score += points;
            players[drawerId].score += 5; // Drawer gets points too
            guessedPlayers.push(socket.id);

            io.emit('update_player_list', Object.values(players));
            io.emit('chat_message', { 
                name: "System", 
                text: `${player.name} guessed the word!`, 
                type: 'correct' 
            });
            
            // Reveal word privately to the guesser
            socket.emit('word_reveal', currentWord);

            // If everyone guessed, end round early
            const guessersCount = Object.keys(players).length - 1;
            if (guessedPlayers.length >= guessersCount) {
                endRound();
            }

        } else {
            // Normal Chat
            io.emit('chat_message', { 
                name: player.name, 
                text: msg, 
                type: 'normal' 
            });
        }
    });

    // 5. DISCONNECT
    socket.on('disconnect', () => {
        delete players[socket.id];
        delete customUsed[socket.id];
        const idx = playerOrder.indexOf(socket.id);
        if (idx !== -1) playerOrder.splice(idx, 1);
        if (hostId === socket.id) hostId = playerOrder[0] || null;
        io.emit('update_player_list', Object.values(players));
        if (socket.id === drawerId) endRound(); // End round if drawer leaves
        emitHostUpdate();
    });
});

// --- GAME LOOP HELPERS ---
function startNewRound() {
    isGameRunning = true;
    guessedPlayers = [];
    
    // Pick next drawer (round-robin in join order)
    const playerIds = Object.keys(players);
    if (playerIds.length < 2) {
        isGameRunning = false;
        currentRound = 0;
        currentOptions = [];
        currentWord = "";
        currentHintDisplay = "";
        revealedIndices = new Set();
        pendingHintTimes = new Set();
        drawerId = null;
        roundTime = 0;
        resetCustomUsage();
        io.emit('game_reset', "Not enough players.");
        emitHostUpdate();
        return;
    }

    // Round-robin drawer rotation
    currentRound += 1;
    if (currentRound > TOTAL_ROUNDS) {
        endGame();
        return;
    }
    drawerId = getNextDrawerId();
    if (!drawerId) {
        isGameRunning = false;
        currentRound = 0;
        currentOptions = [];
        currentWord = "";
        currentHintDisplay = "";
        revealedIndices = new Set();
        pendingHintTimes = new Set();
        roundTime = 0;
        io.emit('game_reset', "Not enough players.");
        emitHostUpdate();
        return;
    }

    // Send 6 words to drawer
    const options = pickRandomWords(6);
    currentOptions = options;
    const canCustom = !customUsed[drawerId];

    io.emit('clear_canvas');
    io.emit('choosing_word', { drawerId }); // Tell everyone someone is choosing
    io.to(drawerId).emit('choose_word', { words: options, canCustom }); // Show modal to drawer
}

function endRound() {
    clearInterval(roundInterval);
    pendingHintTimes = new Set();
    io.emit('chat_message', { 
        name: "System", 
        text: `Round over! The word was ${currentWord}`, 
        type: 'system' 
    });
    
    // Small delay before next round
    setTimeout(() => {
        if (currentRound >= TOTAL_ROUNDS) {
            endGame();
            return;
        }
        startNewRound();
    }, 3000);
}

function generateUnderscores(word) {
    return word.replace(/[A-Z]/g, '_ ').trim();
}

function buildHintDisplay() {
    if (!currentWord) return "";
    let out = "";
    for (let i = 0; i < currentWord.length; i++) {
        const ch = currentWord[i];
        if (ch === " ") {
            out += "  ";
        } else if (revealedIndices.has(i)) {
            out += ch + " ";
        } else {
            out += "_ ";
        }
    }
    return out.trim();
}

function revealRandomLetter() {
    if (!currentWord) return false;
    const candidates = [];
    for (let i = 0; i < currentWord.length; i++) {
        const ch = currentWord[i];
        if (ch !== " " && !revealedIndices.has(i)) candidates.push(i);
    }
    if (candidates.length === 0) return false;
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    revealedIndices.add(idx);
    currentHintDisplay = buildHintDisplay();
    io.emit('word_hint', { word: currentHintDisplay });
    return true;
}

function emitHostUpdate() {
    io.emit('host_update', {
        hostId,
        isGameRunning,
        canStart: !isGameRunning && Object.keys(players).length >= 2
    });
}

function normalizePlayerOrder() {
    playerOrder = playerOrder.filter(id => players[id]);
    if (hostId && !players[hostId]) hostId = null;
    if (!hostId && playerOrder.length) hostId = playerOrder[0];
}

function getNextDrawerId() {
    normalizePlayerOrder();
    if (playerOrder.length === 0) return null;
    if (!drawerId) return playerOrder[0];
    const idx = playerOrder.indexOf(drawerId);
    if (idx === -1) return playerOrder[0];
    return playerOrder[(idx + 1) % playerOrder.length];
}

function pickRandomWords(count) {
    const picks = new Set();
    const target = Math.min(count, WORD_LIST.length);
    while (picks.size < target) {
        picks.add(WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]);
    }
    return Array.from(picks);
}

function sanitizeCustomWord(input) {
    if (typeof input !== "string") return null;
    const cleaned = input.toUpperCase()
        .replace(/[^A-Z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) return null;
    if (cleaned.length < 1 || cleaned.length > 50) return null;
    return cleaned;
}

function resetCustomUsage() {
    customUsed = {};
    Object.keys(players).forEach(id => {
        customUsed[id] = false;
    });
}

function startRoundWithWord(word) {
    currentWord = word.toUpperCase();
    currentOptions = [];
    revealedIndices = new Set();
    pendingHintTimes = new Set([45, 20, 10, 5]);
    currentHintDisplay = buildHintDisplay();
    roundTime = 60;

    // Notify everyone round has started
    io.emit('round_start', {
        drawerId: drawerId,
        word: currentHintDisplay
    });

    // Tell drawer the real word
    io.to(drawerId).emit('your_turn', currentWord);

    // Start Timer
    clearInterval(roundInterval);
    roundInterval = setInterval(() => {
        roundTime--;
        io.emit('timer_update', roundTime);
        if (pendingHintTimes.has(roundTime)) {
            pendingHintTimes.delete(roundTime);
            revealRandomLetter();
        }
        if (roundTime <= 0) endRound();
    }, 1000);
}

function endGame() {
    clearInterval(roundInterval);
    isGameRunning = false;
    roundTime = 0;
    currentRound = 0;
    currentOptions = [];
    drawerId = null;
    currentWord = "";
    guessedPlayers = [];
    currentHintDisplay = "";
    revealedIndices = new Set();
    pendingHintTimes = new Set();
    resetCustomUsage();

    const playerList = Object.values(players);
    if (playerList.length === 0) {
        currentOptions = [];
        customUsed = {};
        hostId = null;
        playerOrder = [];
        io.emit('game_reset', "Not enough players.");
        emitHostUpdate();
        return;
    }

    const maxScore = Math.max(...playerList.map(p => p.score));
    const winners = playerList.filter(p => p.score === maxScore);
    const winnerNames = winners.map(p => p.name).join(", ");
    const resultText = winners.length === 1
        ? `Game over! Winner: ${winnerNames} with ${maxScore} points.`
        : `Game over! Tie between ${winnerNames} with ${maxScore} points.`;

    io.emit('chat_message', { name: "System", text: resultText, type: 'system' });
    io.emit('game_reset', "Game over! Host can start a new game.");
    emitHostUpdate();
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
