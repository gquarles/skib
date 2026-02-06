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
const TOTAL_ROUNDS = 5; // Turns per player per game
let currentOptions = [];
let currentDifficulty = "easy";
let customUsed = {}; // { socketId: boolean }
let hostId = null;
let playerOrder = [];
let revealedIndices = new Set();
let currentHintDisplay = "";
let pendingHintTimes = new Set();
const HINT_SPACE_MARKER = "|";
let maxTurns = 0;
let roundEnding = false;
let roundTimeout = null;

const EASY_WORDS = [
    "APPLE", "BANANA", "ORANGE", "GRAPES", "LEMON", "PEACH", "PEAR", "CHERRY", "MELON", "BERRY",
    "CARROT", "TOMATO", "POTATO", "ONION", "GARLIC", "BREAD", "TOAST", "PIZZA", "TACO", "SUSHI",
    "SALAD", "COOKIE", "CUPCAKE", "DONUT", "CAKE", "PIE", "CANDY", "POPCORN", "HOT DOG", "BURGER",
    "FRIES", "EGG", "PANCAKE", "WAFFLE", "CEREAL", "MILK", "JUICE", "COFFEE", "TEAPOT", "MUG",
    "SPOON", "FORK", "KNIFE", "PLATE", "BOWL", "CUP", "BOTTLE", "CAT", "DOG", "FISH",
    "BIRD", "HORSE", "COW", "PIG", "SHEEP", "GOAT", "MOUSE", "RABBIT", "TURTLE", "FROG",
    "BEAR", "LION", "TIGER", "ZEBRA", "GIRAFFE", "ELEPHANT", "MONKEY", "PANDA", "KOALA", "DOLPHIN",
    "SHARK", "WHALE", "OCTOPUS", "CRAB", "BUTTERFLY", "BEE", "ANT", "SPIDER", "SNAKE", "LIZARD",
    "CHICKEN", "DUCK", "OWL", "EAGLE", "PENGUIN", "KANGAROO", "CAMEL", "HIPPO", "RHINO", "WOLF",
    "FOX", "DEER", "RACCOON", "SQUIRREL", "HAMSTER", "HEDGEHOG", "BAT", "SUN", "MOON", "STAR",
    "CLOUD", "RAIN", "SNOW", "WIND", "RAINBOW", "MOUNTAIN", "RIVER", "OCEAN", "LAKE", "TREE",
    "FLOWER", "ROSE", "TULIP", "CACTUS", "LEAF", "GRASS", "ROCK", "VOLCANO", "ISLAND", "BEACH",
    "FOREST", "DESERT", "WATERFALL", "FIRE", "ICE", "SNOWMAN", "TENT", "HOUSE", "CASTLE", "BRIDGE",
    "ROAD", "SIGN", "FLAG", "GARDEN", "CHAIR", "TABLE", "COUCH", "BED", "PILLOW", "BLANKET",
    "LAMP", "CLOCK", "PHONE", "CAMERA", "TV SET", "KEY", "LOCK", "DOOR", "WINDOW", "MIRROR",
    "BUCKET", "SPONGE", "SOAP", "TOWEL", "TOOTHBRUSH", "HAT", "CAP", "SHOE", "BOOT", "SOCK",
    "SHIRT", "PANTS", "DRESS", "JACKET", "GLOVE", "RING", "WATCH", "BACKPACK", "UMBRELLA", "BALL",
    "KITE", "BOOK", "PEN", "PENCIL", "ERASER", "SCISSORS", "GIFT", "TOY", "DOLL", "ROBOT",
    "CAR", "BUS", "BOAT", "BIKE", "TRUCK", "BALLOON", "HEART", "CIRCLE", "SQUARE", "TRIANGLE",
    "SMILE", "LAUGH", "JUMP", "DANCE", "RUN", "SWIM", "SLEEP", "READ", "WRITE"
];

const MEDIUM_WORDS = [
    "FIRE TRUCK", "POLICE CAR", "TRAFFIC LIGHT", "STOP SIGN", "STREET MAP", "PARKING LOT", "ICE SKATES", "ROLLER SKATES", "SKATE PARK", "SOCCER BALL",
    "SOCCER GOAL", "BASEBALL BAT", "BASEBALL GLOVE", "TENNIS RACKET", "PING PONG", "GOLF CLUB", "BOWLING BALL", "DART BOARD", "BASKETBALL HOOP", "HOCKEY STICK",
    "BOXING GLOVES", "JUMP ROPE", "TREADMILL", "YOGA MAT", "SWIMMING POOL", "WATER SLIDE", "SAND CASTLE", "BEACH TOWEL", "SUN GLASSES", "RAIN COAT",
    "SNOW BOOTS", "WINTER HAT", "LIFE JACKET", "FIRST AID", "BAND AID", "STETHOSCOPE", "DOCTOR", "NURSE", "FIREFIGHTER", "POLICE OFFICER",
    "CHEF HAT", "WAITER", "SCHOOL BUS", "PLAYGROUND", "SAND BOX", "TREE HOUSE", "DOG LEASH", "CAT TOY", "FISH BOWL", "BIRD CAGE",
    "HAMSTER WHEEL", "PET STORE", "ZOO MAP", "CIRCUS TENT", "TICKET BOOTH", "MOVIE THEATER", "POPCORN BAG", "MUSIC NOTE", "GUITAR PICK", "DRUM SET",
    "PIANO KEYS", "VIOLIN", "TRUMPET", "SAXOPHONE", "HEADPHONES", "EARBUDS", "VIDEO GAME", "GAME CONSOLE", "REMOTE CONTROL", "COMPUTER MOUSE",
    "KEYBOARD", "LAPTOP", "PHONE CHARGER", "POWER CORD", "LIGHT BULB", "EXTENSION CORD", "TOOL BOX", "HAMMER", "SCREWDRIVER", "WRENCH",
    "PAINT BRUSH", "PAINT BUCKET", "TAPE MEASURE", "LADDER", "GARDEN HOSE", "LAWN MOWER", "FLOWER POT", "WATERING CAN", "SPRAY BOTTLE", "TRASH CAN",
    "RECYCLE BIN", "WASHING MACHINE", "DISHWASHER", "MICROWAVE", "TOASTER", "BLENDER", "FRIDGE DOOR", "SHOPPING CART", "GROCERY BAG", "CASH REGISTER",
    "CREDIT CARD", "GIFT CARD", "BIRTHDAY CAKE", "PARTY HAT", "CONFETTI", "WRAPPING PAPER", "BOW TIE", "NECK TIE", "SUITCASE", "PASSPORT",
    "AIRPLANE WING", "TRAIN STATION", "BUS STOP", "GAS PUMP", "CAR WASH", "PARKING METER", "BIKE LOCK", "MOTORCYCLE", "HOT AIR BALLOON", "SPACESHIP",
    "SATELLITE", "SPACE SUIT", "DIVING MASK", "SNORKEL", "FISHING ROD", "TACKLE BOX", "CAMP SITE", "CAMPFIRE", "SLEEPING BAG", "BACKPACK STRAP",
    "HIKING BOOTS", "TRAIL SIGN", "MOUNTAIN BIKE", "SNOWBOARD", "SKI LIFT", "ICE RINK", "SURF BOARD", "WAVE POOL", "WATER BOTTLE", "THERMOS",
    "LUNCH BOX", "BENTO BOX", "PICNIC TABLE", "PICNIC BASKET", "COFFEE SHOP", "TEA SHOP", "PIZZA BOX", "TAKEOUT", "FOOD TRUCK", "ICE CREAM CONE",
    "DONUT SHOP", "BAKER", "BARBER", "HAIR DRYER", "MAKEUP", "NAIL POLISH", "SHOPPING MALL", "TOY STORE", "BOOK STORE", "PET SALON",
    "CAR DEALER", "BANK TELLER", "MAIL TRUCK", "POST OFFICE", "MAIL BOX", "DELIVERY", "PACKAGE", "CARDBOARD BOX", "TEDDY BEAR", "TOY CAR",
    "ACTION FIGURE", "PUZZLE", "JIGSAW", "LEGO TOWER", "SNOW GLOBE", "PIGGY BANK", "ALARM CLOCK", "HOURGLASS", "CALENDAR", "NOTEBOOK",
    "HOMEWORK", "CLASSROOM", "BLACKBOARD", "CHALK", "WHITEBOARD", "MARKER", "SCIENCE LAB", "TEST TUBE", "MICROSCOPE", "MAGNIFYING GLASS",
    "TELESCOPE", "PLANETARIUM", "MUSEUM", "ART GALLERY", "PAINT PALETTE", "SKETCH BOOK", "COMIC BOOK", "NEWSPAPER", "WEATHER MAP", "TORNADO"
];

const HARD_WORDS = [
    "TIME TRAVEL", "PARALLEL WORLD", "BLACK HOLE", "QUANTUM LEAP", "GRAVITY", "MAGNETISM", "WIRELESS SIGNAL", "LOST AND FOUND", "SOCIAL MEDIA", "FAKE NEWS",
    "IDENTITY THEFT", "MIND READING", "STAGE FRIGHT", "PEER PRESSURE", "MIXED SIGNALS", "BROKEN PROMISE", "COLD SHOULDER", "SILVER LINING", "BUSY BEE", "FISH OUT OF WATER",
    "WILD GOOSE CHASE", "NEEDLE IN HAYSTACK", "PIECE OF CAKE", "HEART OF GOLD", "UNDER PRESSURE", "STRESS TEST", "BRAIN FREEZE", "BRAINSTORM", "DAYDREAM", "NIGHTMARE",
    "LUCID DREAM", "INSIDE JOKE", "AWKWARD SILENCE", "SMALL TALK", "GROUP CHAT", "WRONG NUMBER", "MISSED CALL", "LOW BATTERY", "SYSTEM UPDATE", "ERROR MESSAGE",
    "LOADING SCREEN", "WIFI PASSWORD", "SECRET AGENT", "DOUBLE AGENT", "SPY MOVIE", "ESCAPE PLAN", "PRISON BREAK", "JOB INTERVIEW", "OFFICE MEETING", "TEAM PLAYER",
    "DEADLINE", "OVERTIME", "PARKING TICKET", "SPEED LIMIT", "TRAFFIC JAM", "ROAD RAGE", "FLAT TIRE", "LOST LUGGAGE", "SECURITY CHECK", "BOARDING PASS",
    "DELAYED FLIGHT", "RED EYE", "JET LAG", "TIME ZONE", "PASSPORT PHOTO", "HOTEL LOBBY", "ROOM SERVICE", "WAKE UP CALL", "LOST KEYCARD", "BROKEN ELEVATOR",
    "POWER OUTAGE", "BLACKOUT", "EMERGENCY EXIT", "FIRE DRILL", "EARTHQUAKE DRILL", "STORM SHELTER", "EVACUATION", "SPACE LAUNCH", "ALIEN SIGNAL", "UFO SIGHTING",
    "METEOR SHOWER", "SOLAR ECLIPSE", "LUNAR ECLIPSE", "CONSTELLATION", "ASTEROID BELT", "SPACE DEBRIS", "SPACE WALK", "MOON LANDING", "MARS ROVER", "DEEP SEA",
    "SEA LEVEL", "RIP CURRENT", "SHARK ATTACK", "SHIPWRECK", "MESSAGE IN BOTTLE", "TREASURE HUNT", "HIDDEN CAVE", "SECRET PASSAGE", "TRAP DOOR", "MAGIC PORTAL",
    "INVISIBLE CLOAK", "SHAPE SHIFTER", "TELEPORT", "MIND CONTROL", "SPELL BOOK", "ANCIENT CURSE", "HAUNTED MIRROR", "CURSED DOLL", "CREEPY CLOWN", "URBAN LEGEND",
    "GHOST TOWN", "ZOMBIE OUTBREAK", "VAMPIRE BITE", "WEREWOLF", "DRAGON EGG", "GIANT SPIDER", "KRAKEN", "MYTHICAL BEAST", "LEGENDARY HERO", "FINAL BOSS",
    "BOSS FIGHT", "GAME OVER", "HIGH SCORE", "CHEAT CODE", "SPEED RUN", "LEVEL UP", "POWER UP", "RANDOM ENCOUNTER", "SIDE QUEST", "QUEST LOG",
    "SAVE POINT", "RESPAWN", "BOARD MEETING", "STOCK MARKET", "MONEY LAUNDERING", "TAX RETURN", "STUDENT LOAN", "CREDIT SCORE", "LATE FEE", "OVERDRAFT",
    "BUDGET CUT", "PRICE HIKE", "SHOPPING SPREE", "IMPULSE BUY", "BUYER REMORSE", "HARD BARGAIN", "SALES PITCH", "CUSTOMER SERVICE", "COMPLAINT BOX", "SUGGESTION BOX",
    "QUALITY CONTROL", "WARRANTY", "BROKEN SCREEN", "CRACKED PHONE", "FROZEN APP", "BLUE SCREEN", "DATA LEAK", "PASSWORD RESET", "TWO FACTOR", "FACE SCAN",
    "FINGERPRINT", "VOICE COMMAND", "SMART HOME", "ROBOT VACUUM", "SELF DRIVING", "ELECTRIC CAR", "CHARGING STATION", "TRAFFIC CAMERA", "SPEED TRAP", "PARKING GARAGE",
    "CARPOOL LANE", "TOLL BOOTH", "CONSTRUCTION ZONE", "DETOUR", "ROAD CLOSED", "TRAIN DELAY", "SIGNAL FAILURE", "LOST IN MAZE", "ESCAPE ROOM", "PUZZLE BOX",
    "RIDDLE", "CONSPIRACY", "SECRET CODE", "CIPHER", "MAP LEGEND", "COMPASS ROSE", "NORTH STAR", "MIRAGE", "OPTICAL ILLUSION", "FORCED PERSPECTIVE",
    "MIRROR MAZE", "HALL OF MIRRORS", "MAGIC SHOW", "CARD TRICK", "SLEIGHT OF HAND", "VANISHING ACT", "SMOKE AND MIRRORS", "STAGE MAKEUP", "COSTUME CHANGE", "QUICK CHANGE"
];
const DIFFICULTY_MULTIPLIER = { easy: 1, medium: 1.4, hard: 1.8 };
const GHOST_THEMES = new Set(["classic", "mint", "peach", "lilac", "midnight"]);
const HEIGHT_THEMES = new Set(["short", "standard", "tall"]);
const LEG_THEMES = new Set(["classic", "long", "stubby", "wavy", "float"]);

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. JOIN GAME
    socket.on('join_game', (payload) => {
        const rawName = (typeof payload === "string") ? payload : payload?.name;
        const ghostId = (typeof payload === "object") ? sanitizeGhostId(payload?.ghost) : null;
        const heightId = (typeof payload === "object") ? sanitizeHeightId(payload?.height) : null;
        const legsId = (typeof payload === "object") ? sanitizeLegId(payload?.legs) : null;
        players[socket.id] = {
            id: socket.id,
            name: rawName || `Guest ${socket.id.substr(0,4)}`,
            score: 0,
            ghost: ghostId || "classic",
            height: heightId || "standard",
            legs: legsId || "classic"
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
        if (roundTimeout) {
            clearTimeout(roundTimeout);
            roundTimeout = null;
        }
        clearInterval(roundInterval);
        Object.values(players).forEach(p => { p.score = 0; });
        currentRound = 0;
        maxTurns = TOTAL_ROUNDS * Object.keys(players).length;
        roundEnding = false;
        currentOptions = [];
        currentWord = "";
        currentHintDisplay = "";
        revealedIndices = new Set();
        pendingHintTimes = new Set();
        guessedPlayers = [];
        drawerId = null;
        currentDifficulty = "easy";
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

    // 2.5 CURSOR TRACKING
    socket.on('cursor_update', (data) => {
        const player = players[socket.id];
        if (!player) return;
        const x = Math.min(1, Math.max(0, Number(data?.x)));
        const y = Math.min(1, Math.max(0, Number(data?.y)));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        socket.broadcast.emit('cursor_update', { id: socket.id, x, y });
    });
    socket.on('cursor_leave', () => {
        socket.broadcast.emit('cursor_leave', socket.id);
    });

    // 3. WORD SELECTION
    socket.on('word_chosen', (word) => {
        if (socket.id !== drawerId) return;
        if (!currentOptions.length) return;
        const selected = String(word || "").toUpperCase();
        const option = currentOptions.find(opt => opt.word === selected);
        if (!option) return;
        startRoundWithWord(option.word, option.difficulty);
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
        startRoundWithWord(sanitized, "easy");
    });

    // 4. CHAT & GUESSING
    socket.on('chat_message', (msg) => {
        const player = players[socket.id];
        if (!player) return;
        const text = typeof msg === "string" ? msg : String(msg ?? "");
        const guess = text.trim().toUpperCase();

        // If it's a correct guess
        if (isGuessWindowOpen() &&
            socket.id !== drawerId && 
            guess === currentWord && 
            !guessedPlayers.includes(socket.id)) {
            
            // Handle Correct Guess
            const basePoints = Math.max(10, Math.ceil(roundTime / 2));
            const multiplier = DIFFICULTY_MULTIPLIER[currentDifficulty] || 1;
            const points = Math.ceil(basePoints * multiplier);
            player.score += points;
            if (players[drawerId]) {
                players[drawerId].score += 5; // Drawer gets points too
            }
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
                text, 
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
        socket.broadcast.emit('cursor_leave', socket.id);
        if (socket.id === drawerId) endRound(); // End round if drawer leaves
        emitHostUpdate();
    });
});

// --- GAME LOOP HELPERS ---
function startNewRound() {
    isGameRunning = true;
    guessedPlayers = [];
    roundEnding = false;
    if (roundTimeout) {
        clearTimeout(roundTimeout);
        roundTimeout = null;
    }
    
    // Pick next drawer (round-robin in join order)
    const playerIds = Object.keys(players);
    if (playerIds.length < 2) {
        isGameRunning = false;
        currentRound = 0;
        maxTurns = 0;
        currentOptions = [];
        currentWord = "";
        currentHintDisplay = "";
        revealedIndices = new Set();
        pendingHintTimes = new Set();
        currentDifficulty = "easy";
        drawerId = null;
        roundTime = 0;
        resetCustomUsage();
        io.emit('game_reset', "Not enough players.");
        emitHostUpdate();
        return;
    }

    // Round-robin drawer rotation
    if (!maxTurns) maxTurns = TOTAL_ROUNDS * playerIds.length;
    currentRound += 1;
    if (maxTurns && currentRound > maxTurns) {
        endGame();
        return;
    }
    drawerId = getNextDrawerId();
    if (!drawerId) {
        isGameRunning = false;
        currentRound = 0;
        maxTurns = 0;
        currentOptions = [];
        currentWord = "";
        currentHintDisplay = "";
        revealedIndices = new Set();
        pendingHintTimes = new Set();
        currentDifficulty = "easy";
        roundTime = 0;
        io.emit('game_reset', "Not enough players.");
        emitHostUpdate();
        return;
    }

    // Send 6 words to drawer (2 easy, 2 medium, 2 hard)
    const options = [
        ...pickRandomWords(EASY_WORDS, 2).map(word => ({ word, difficulty: "easy" })),
        ...pickRandomWords(MEDIUM_WORDS, 2).map(word => ({ word, difficulty: "medium" })),
        ...pickRandomWords(HARD_WORDS, 2).map(word => ({ word, difficulty: "hard" }))
    ];
    currentOptions = shuffleArray(options);
    const canCustom = !customUsed[drawerId];

    io.emit('clear_canvas');
    io.emit('choosing_word', { drawerId }); // Tell everyone someone is choosing
    io.to(drawerId).emit('choose_word', { drawerId, words: currentOptions, canCustom }); // Show modal to drawer
}

function isGuessWindowOpen() {
    return isGameRunning &&
        !roundEnding &&
        !!drawerId &&
        !!currentWord &&
        roundTime > 0 &&
        currentOptions.length === 0;
}

function endRound() {
    if (roundEnding) return;
    roundEnding = true;
    clearInterval(roundInterval);
    pendingHintTimes = new Set();
    io.emit('chat_message', { 
        name: "System", 
        text: `Round over! The word was ${currentWord}`, 
        type: 'system' 
    });
    
    // Small delay before next round
    if (roundTimeout) clearTimeout(roundTimeout);
    roundTimeout = setTimeout(() => {
        roundTimeout = null;
        if (maxTurns && currentRound >= maxTurns) {
            endGame();
            return;
        }
        startNewRound();
    }, 3000);
}

function formatHintDisplay(word, revealedSet) {
    if (!word) return "";
    let out = "";
    for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        if (ch === " ") {
            out += `${HINT_SPACE_MARKER} `;
            continue;
        }
        const isRevealed = revealedSet && revealedSet.has(i);
        out += (isRevealed ? ch : "_") + " ";
    }
    return out.trim();
}

function generateUnderscores(word) {
    return formatHintDisplay(word, null);
}

function buildHintDisplay() {
    return formatHintDisplay(currentWord, revealedIndices);
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

function pickRandomWords(list, count) {
    const picks = new Set();
    const target = Math.min(count, list.length);
    while (picks.size < target) {
        picks.add(list[Math.floor(Math.random() * list.length)]);
    }
    return Array.from(picks);
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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

function sanitizeGhostId(input) {
    if (typeof input !== "string") return null;
    const cleaned = input.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleaned) return null;
    if (!GHOST_THEMES.has(cleaned)) return null;
    return cleaned;
}

function sanitizeHeightId(input) {
    if (typeof input !== "string") return null;
    const cleaned = input.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleaned) return null;
    if (!HEIGHT_THEMES.has(cleaned)) return null;
    return cleaned;
}

function sanitizeLegId(input) {
    if (typeof input !== "string") return null;
    const cleaned = input.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleaned) return null;
    if (!LEG_THEMES.has(cleaned)) return null;
    return cleaned;
}

function resetCustomUsage() {
    customUsed = {};
    Object.keys(players).forEach(id => {
        customUsed[id] = false;
    });
}

function startRoundWithWord(word, difficulty = "easy") {
    currentWord = word.toUpperCase();
    currentOptions = [];
    revealedIndices = new Set();
    pendingHintTimes = new Set([45, 20, 10, 5]);
    currentHintDisplay = buildHintDisplay();
    roundTime = 60;
    currentDifficulty = difficulty || "easy";

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
    if (roundTimeout) {
        clearTimeout(roundTimeout);
        roundTimeout = null;
    }
    clearInterval(roundInterval);
    isGameRunning = false;
    roundTime = 0;
    currentRound = 0;
    maxTurns = 0;
    roundEnding = false;
    currentOptions = [];
    drawerId = null;
    currentWord = "";
    guessedPlayers = [];
    currentHintDisplay = "";
    revealedIndices = new Set();
    pendingHintTimes = new Set();
    currentDifficulty = "easy";
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
