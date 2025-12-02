// --- Game Constants ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const PLAYER_SPEED = 5;
const SPIDER_SPEED = 2;


const PLAYER_SIZE = 96;
const SPIDER_SIZE = 96;
const KING_SPIDER_SCALE = 1.6; // scale multiplier for king spider visuals

// --- Load Images ---
const playerImg = new Image();
playerImg.src = 'Pics/Player.png';
const spiderImg = new Image();
spiderImg.src = 'Pics/NormalSpider.png';
// King spider texture (for level 5)
const kingSpiderImg = new Image();
kingSpiderImg.src = 'Pics/KingSpider.png';
const knifeImg = new Image();
knifeImg.src = 'Pics/Knife.png';
const spiderBulletImg = new Image();
spiderBulletImg.src = 'Pics/SpiderBullet.png';
const heartImg = new Image();
heartImg.src = 'Pics/Heart.png';
const halfHeartImg = new Image();
halfHeartImg.src = 'Pics/HalfHeart.png';
const drawerImg = new Image();
drawerImg.src = 'Pics/Drawer.png';
const appleImg = new Image();
appleImg.src = 'Pics/Apple.png';

// --- Input Handling ---
const keys = {};
document.addEventListener('keydown', (e) => { if (persistentPromptActive) return; keys[e.key] = true; });
document.addEventListener('keyup', (e) => { if (persistentPromptActive) return; keys[e.key] = false; });

let player = { x: 40, y: (canvas ? canvas.height - PLAYER_SIZE : 0), width: PLAYER_SIZE, height: PLAYER_SIZE, dx: 0, dy: 0, dyVel: 0, onGround: true, facing: 1, hasKnife: true, hitboxInset: 16 };
let spider = { x: 0, y: 0, width: SPIDER_SIZE, height: SPIDER_SIZE, alive: true, shootCooldown: 0 };
let projectiles = [];
let score = 0;
let gameRunning = false;
let level = 1;
// Level thresholds for advancing to the next level (default values)
// Note: level 1 has a special max score of 600 (only when at level 1)
// levelThresholds[N] is the score required to reach level N when currently at level N-1
const levelThresholds = { 2: 1000, 3: 1000, 4: 1800, 5: 3000, 6: 6000 };
const LEVEL1_MAX_SCORE = 600; // only used when current level === 1

// Fixed damage values (applies to all levels)
const KNIFE_DAMAGE = 100;
const AXE_DAMAGE = 125;
const BIBSWORD_DAMAGE = 300;
const NINJA_STAR_DAMAGE = 1000;
let constructing = false; // true while construction/pause between levels
let postStartPrompt = false; // show blocking prompt after Start until Enter pressed

// Drawer object
let drawerObj = {
    x: 10,
    y: 0, // will be set after image loads
    width: 60, // will be set after image loads
    height: 120, // will be set after image loads
    platformInset: 50, // platform width
    platformYOffset: 25, // make platform a bit higher (was 40)
};

drawerImg.onload = function() {
    const drawerTargetHeight = 120;
    const drawerAspect = drawerImg.naturalWidth / drawerImg.naturalHeight || 1;
    drawerObj.width = drawerTargetHeight * drawerAspect;
    drawerObj.height = drawerTargetHeight;
    drawerObj.x = 10;
    drawerObj.y = canvas.height - drawerObj.height - 10;
    draw();
};

// Apple eat state
let appleEaten = false;

// Helper: safe aspect ratio for images (avoid division by zero / NaN)
function safeAspect(img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return 1;
    return img.naturalWidth / img.naturalHeight;
}

// --- Shop/Game State ---
let gamePaused = false;
let inShop = false;
let spidCoins = 0;
let shopMenuVisible = false;
let codeMenuVisible = false;
let codeInput = '';
let shopProducts = [
    { name: 'Apple', price: 1, bought: false, rebuyable: true },
    { name: 'Axe', price: 100, bought: false, rebuyable: false },
    { name: 'Knife', price: 0, bought: false, rebuyable: false }
];

// Add Bib Sword and Runboost products
shopProducts.push({ name: 'Bib Sword', price: 300, bought: false, rebuyable: false });
shopProducts.push({ name: 'RunBoost', price: 100, bought: false, rebuyable: false });
// Ninja Star product
shopProducts.push({ name: 'Ninja Star', price: 1000, bought: false, rebuyable: false });
// Shield product (rebuyable to recharge)
shopProducts.push({ name: 'Shield', price: 50, bought: false, rebuyable: true });
let missions = [];
// Indicates a save was loaded/applied - prevents resetGame from wiping loaded values when Start is pressed
let saveLoaded = false;

function randomMission() {
    const templates = [
        {desc: 'Jump %N times', type: 'jump', min: 3, max: 8, reward: 10},
        {desc: 'Hit spider %N times', type: 'hit', min: 2, max: 6, reward: 15}
        // Removed survive mission
    ];
    const t = templates[Math.floor(Math.random()*templates.length)];
    const n = Math.floor(Math.random()*(t.max-t.min+1))+t.min;
    return {desc: t.desc.replace('%N', n), type: t.type, target: n, progress: 0, reward: t.reward, done: false};
}

function generateMissions() {
    // Max 3 missions at a time, allow duplicate types but not duplicate targets
    missions = [];
    while (missions.length < 3) {
        let m = randomMission();
        // Only prevent exact duplicate (type+target), allow same type with different targets
        if (!missions.some(existing => existing.type === m.type && existing.target === m.target)) missions.push(m);
    }
}

function resetGame() {
    player.health = 6; // 3 hearts, 6 half-hearts
    player.x = Math.floor(canvas.width * 0.1); // 10% from the left (middle left)
    player.y = canvas.height/2 - PLAYER_SIZE/2;
    player.dyVel = 0;
    player.onGround = true;
    player.facing = 1;
    player.hasKnife = true;
    score = 0;
    level = 1;
    constructing = false;
    // Calculate spider width based on image aspect ratio (safe)
    let aspect = safeAspect(spiderImg);
    spider.width = SPIDER_SIZE * aspect;
    spider.height = SPIDER_SIZE;
    // Spawn spider on the right ground area
    spider.x = Math.max(40, canvas.width - spider.width - 40);
    spider.y = canvas.height - spider.height;
    spider.alive = true;
    spider.shootCooldown = 120; // 2 seconds at 60fps
    // Standardize spider health via maxHealth so damage calculations are consistent
    // Level 1 spider health per design
    spider.maxHealth = 600;
    spider.health = spider.maxHealth;
    projectiles = [];
    appleEaten = false; // Reset apple eaten state
    // Show drawer again on reset
    document.getElementById('start-btn').style.display = 'block'; // Show button again on reset
    updateUI();
    // Generate new missions
    generateMissions();
    spidCoins = 0;
    shopProducts.forEach(p => p.bought = false);
    shopMenuVisible = false;
    codeMenuVisible = false;
    inShop = false;
    gamePaused = false;
    codeInput = '';
    // Reset shield state
    shieldHitsRemaining = 0;
}

// Simple popup/toast system (small messages at top)
let popupQueue = [];
let popupTimer = 0;
// Glitch state for win effect
let glitchActive = false;
let glitchStart = 0;
let GLITCH_DURATION_MS = 15000; // 15 seconds
// small buffer used for channel offsets during glitch
let glitchParams = { offsetX: 0, offsetY: 0, hueShift: 0 };
// Persistent blocking prompt after glitch
let persistentPromptActive = false;
function showPopup(message, duration = 2500) {
    popupQueue.push({ message, duration, start: Date.now() });
}

function startGlitchSequence() {
    glitchActive = true;
    glitchStart = Date.now();
    // pause normal game logic but keep the render loop running
    gamePaused = true;
    gameRunning = true;
    showPopup('YOU WIN! Glitch sequence starting...', 2000);
}

function drawGlitch() {
    if (!glitchActive) return;
    const elapsed = Date.now() - glitchStart;
    // Aggressive glitch parameters
    glitchParams.offsetX = Math.round((Math.random() - 0.5) * 220);
    glitchParams.offsetY = Math.round((Math.random() - 0.5) * 120);
    glitchParams.hueShift = Math.round((Math.random() - 0.5) * 720);

    // Heavy layered channel splits, filters and scale jitter
    for (let i = 0; i < 12; i++) {
        ctx.save();
        const factor = 1 + (Math.random()-0.5) * 0.1 * i;
        const ox = Math.round((Math.random() - 0.5) * glitchParams.offsetX * (1 + i*0.3));
        const oy = Math.round((Math.random() - 0.5) * glitchParams.offsetY * (1 + i*0.25));
        // random filter per layer: invert / hue-rotate / saturate
        const hue = Math.round((glitchParams.hueShift + Math.random()*360) % 360);
        const invert = Math.random() < 0.3 ? 'invert(1)' : '';
        ctx.filter = invert + ' hue-rotate(' + hue + 'deg) saturate(' + (1 + Math.random()*2) + ')';
        ctx.globalAlpha = 0.18 / (1 + i*0.12);
        // slight scale jitter
        const sx = Math.round(canvas.width * (1/factor));
        const sy = Math.round(canvas.height * (1/factor));
        try { ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, ox, oy, canvas.width, canvas.height); } catch (e) { /* best-effort */ }
        ctx.restore();
    }

    // Tearing slices and copies
    for (let s = 0; s < 18; s++) {
        if (Math.random() < 0.9) {
            const sh = Math.floor(Math.random()*120) + 8;
            const sy = Math.floor(Math.random()*(canvas.height - sh));
            const sx = Math.floor(Math.random()*(canvas.width - 20));
            const sw = Math.floor(Math.random()*300) + 20;
            const dx = sx + Math.floor((Math.random()-0.5)*180);
            const dy = sy + Math.floor((Math.random()-0.5)*40);
            ctx.save();
            ctx.globalAlpha = 0.9;
            try { ctx.drawImage(canvas, sx, sy, sw, sh, dx, dy, sw, sh); } catch (e) {}
            ctx.restore();
        }
    }

    // Scanlines and colored noise bars
    for (let y = 0; y < canvas.height; y += 3) {
        if (Math.random() < 0.35) {
            ctx.fillStyle = 'rgba(' + (Math.floor(Math.random()*255)) + ',' + (Math.floor(Math.random()*255)) + ',' + (Math.floor(Math.random()*255)) + ',' + (0.06 + Math.random()*0.18) + ')';
            ctx.fillRect(0, y + (Math.random()*6-3), canvas.width, 1 + Math.random()*6);
        }
    }

    // Strobe flashes
    if (Math.random() < 0.12) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.08 + Math.random()*0.4) + ')';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    // (removed GLITCH text overlay per user request)

    // occasionally jitter the entire canvas-to-canvas copy for extreme effect
    if (Math.random() < 0.2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        try { ctx.drawImage(canvas, Math.round((Math.random()-0.5)*60), Math.round((Math.random()-0.5)*30)); } catch (e) {}
        ctx.restore();
    }

    if (elapsed > GLITCH_DURATION_MS) {
        glitchActive = false;
        persistentPromptActive = true;
        // keep game paused; show a persistent overlay message that cannot be dismissed
        gamePaused = true;
        gameRunning = true; // keep draw loop alive so prompt remains visible
        try { localStorage.setItem('spider_glitch_won', '1'); } catch (e) {}
    }
}
// draw popups in draw()

function updateUI() {
    document.getElementById('score').textContent = 'Score: ' + score;
    const levelElem = document.getElementById('level');
    if (levelElem) levelElem.textContent = 'Level: ' + level;
}

function movePlayer() {
    player.dx = 0;
    // Check run boost expiry
    if (runBoostActive && Date.now() > runBoostExpiresAt) {
        runBoostActive = false;
        showPopup('Run Boost ended');
    }
    const effectiveSpeed = runBoostActive ? PLAYER_SPEED * RUNBOOST_SPEED_MULT : PLAYER_SPEED;
    // Only left/right
    if (keys['ArrowLeft'] || keys['a']) {
        player.dx = -effectiveSpeed;
        player.facing = -1;
    }
    if (keys['ArrowRight'] || keys['d']) {
        player.dx = effectiveSpeed;
        player.facing = 1;
    }
    player.x += player.dx;
    // Jumping and gravity
    let wasOnGround = player.onGround;
    player.onGround = false;
    if (!wasOnGround || player.dyVel !== 0) {
        player.dyVel += 0.7; // gravity
        player.y += player.dyVel;
    }
    // Drawer platform collision (platform is lower than top of drawer)
    const platformLeft = drawerObj.x + drawerObj.platformInset;
    const platformRight = drawerObj.x + drawerObj.width - drawerObj.platformInset;
    const platformY = drawerObj.y + drawerObj.platformYOffset;
    if (
        player.x + player.width > platformLeft &&
        player.x < platformRight &&
        player.y + player.height >= platformY &&
        player.y + player.height - player.dyVel <= platformY
    ) {
        player.y = platformY - player.height;
        player.dyVel = 0;
        player.onGround = true;
    }
    // Floor collision
    if (player.y + player.height >= canvas.height) {
        player.y = canvas.height - player.height;
        player.dyVel = 0;
        player.onGround = true;
    }
    // Boundaries
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	// Always draw the drawer and apple
	ctx.drawImage(drawerImg, drawerObj.x, drawerObj.y, drawerObj.width, drawerObj.height);
	// Apple: keep aspect ratio, sit lower on the drawer
	const appleTargetHeight = 40;
	const appleAspect = appleImg.naturalWidth / appleImg.naturalHeight || 1;
	const appleW = appleTargetHeight * appleAspect;
	const appleH = appleTargetHeight;
	const appleX = drawerObj.x + (drawerObj.width - appleW) / 2;
	const appleY = drawerObj.y - appleH + 18;
    if (!appleEaten) {
        ctx.drawImage(appleImg, appleX, appleY, appleW, appleH);
        // Show prompt if player is close
        if (isPlayerNearApple()) {
            ctx.save();
        ctx.font = '22px "ByteBounce", Arial';
            ctx.fillStyle = '#222';
            ctx.textAlign = 'center';
            ctx.fillText('Press E to eat the apple', appleX + appleW/2, appleY - 10);
            ctx.restore();
        }
    }
	// Draw hearts in top left using images
	let heartX = 16;
	let heartY = 16;
	let heartSize = 32;
	let health = player.health;
	for (let i = 0; i < 3; i++) {
		if (health >= 2) {
			ctx.drawImage(heartImg, heartX + i*heartSize, heartY, heartSize, heartSize);
			health -= 2;
		} else if (health === 1) {
			ctx.drawImage(halfHeartImg, heartX + i*heartSize, heartY, heartSize, heartSize);
			health -= 1;
		} else {
			ctx.globalAlpha = 0.2;
			ctx.drawImage(heartImg, heartX + i*heartSize, heartY, heartSize, heartSize);
			ctx.globalAlpha = 1.0;
		}
	}
	// Draw player
	ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
	// Draw weapon in hand if player has it
    if (player.hasKnife || equippedWeapon === 'Axe' || equippedWeapon === 'Knife') {
        let img = weaponTextures[equippedWeapon] || knifeImg;
        let w = img.naturalWidth || 60;
        let h = img.naturalHeight || 20;
        let scale = equippedWeapon === 'Axe' ? 0.18 : 0.11;
        w *= scale;
        h *= scale;
        let offsetX = player.facing === 1 ? player.width - w + 4 : 40;
        let offsetY = player.height * 0.18;
        let handX = player.x + offsetX + w/2;
        let handY = player.y + offsetY;
        ctx.save();
        ctx.translate(handX, handY);
        ctx.drawImage(img, -w/2, -h/2, w, h);
        ctx.restore();
    }
	// Draw spider with correct aspect ratio
    if (spider.alive) {
    // If level 5, draw king spider texture and scale it up
    let imgToDraw = (level === 5 && kingSpiderImg.complete) ? kingSpiderImg : spiderImg;
    let aspect = safeAspect(imgToDraw);
    let spiderDrawHeight = SPIDER_SIZE * (level === 5 ? KING_SPIDER_SCALE : 1);
    let spiderDrawWidth = spiderDrawHeight * aspect;
        ctx.drawImage(
            imgToDraw,
            spider.x,
            spider.y,
            spiderDrawWidth,
            spiderDrawHeight
        );
		// Draw spider shoot countdown
		ctx.save();
    ctx.font = '24px "ByteBounce", Arial';
		ctx.fillStyle = '#222';
		ctx.textAlign = 'center';
		let seconds = Math.ceil(spider.shootCooldown / 60);
		if (spider.shootCooldown > 0) {
			ctx.fillText(seconds, spider.x + spiderDrawWidth/2, spider.y - 10);
		}
		ctx.restore();
	}
	// Draw projectiles
    projectiles.forEach(p => {
        if (spiderBulletImg && spiderBulletImg.complete) {
            let w = p.size;
            let h = p.size;
            ctx.drawImage(spiderBulletImg, p.x, p.y, w, h);
        } else {
            ctx.fillStyle = '#c00';
            ctx.beginPath();
            ctx.arc(p.x + p.size/2, p.y + p.size/2, p.size/2, 0, 2 * Math.PI);
            ctx.fill();
        }
    });
	// Draw thrown knives/axes
	knives.forEach(k => {
		ctx.save();
		ctx.translate(k.x + k.width/2, k.y + k.height/2);
		ctx.rotate(k.angle);
		let img = weaponTextures[k.weapon] || knifeImg;
		ctx.drawImage(img, -k.width/2, -k.height/2, k.width, k.height);
		ctx.restore();
	});

	// Construction overlay (pause between levels)
	if (constructing) {
		ctx.save();
		ctx.fillStyle = 'rgba(0,0,0,0.6)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = '#fff';
    ctx.font = '28px "ByteBounce", Arial';
		ctx.textAlign = 'center';
		ctx.fillText('Construction... Press Enter to continue', canvas.width/2, canvas.height/2);
		ctx.restore();
	}

    // Draw popups (top center)
    if (popupQueue.length > 0) {
        const now = Date.now();
        // show only first active
        let p = popupQueue[0];
        if (now - p.start < p.duration) {
            ctx.save();
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = '#222';
            ctx.fillRect(canvas.width/2 - 200, 8, 400, 36);
            ctx.fillStyle = '#fff';
            ctx.font = '16px "ByteBounce", Arial';
            ctx.textAlign = 'center';
            ctx.fillText(p.message, canvas.width/2, 32);
            ctx.restore();
        } else {
            popupQueue.shift();
        }
    }

    // Post-start blocking overlay (covers whole screen) instructing save location
    if (postStartPrompt) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '26px "ByteBounce", Arial';
        ctx.textAlign = 'center';
        const lines = [
            'Press CTRL+SHIFT+F to set save location.',
            'Press ENTER to continue'
        ];
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], canvas.width/2, canvas.height/2 + i*36 - 10);
        }
        ctx.restore();
    }
    // If a glitch sequence is active, render its visuals on top
    if (glitchActive) drawGlitch();
    // Persistent non-dismissible black-screen prompt after glitch
    if (persistentPromptActive) {
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = '48px "ByteBounce", Arial';
        ctx.fillText('How did you came so far??', canvas.width/2, canvas.height/2);
        ctx.restore();
    }
}

// Return damage for a thrown weapon depending on current level
function getWeaponDamage(weapon) {
    // Fixed damage values across all levels
    if (weapon === 'Knife') return KNIFE_DAMAGE;
    if (weapon === 'Axe') return AXE_DAMAGE;
    if (weapon === 'Bib Sword') return BIBSWORD_DAMAGE;
    if (weapon === 'Ninja Star') return NINJA_STAR_DAMAGE;
    return 0;
}

function startLevelUp(nextLevel) {
    level = nextLevel;
    // For level 2 we want to immediately apply changes without construction prompt
    score = 0;
    updateUI();
    // Configure spider health for levels
    if (level === 2) {
        spider.maxHealth = 1000;
    } else if (level === 3) {
        // Level 3: no construction pause, allow throwing immediately
        spider.maxHealth = 1800; // scale up for level 3
    } else if (level === 4) {
        spider.maxHealth = 3000;
    } else if (level === 5) {
        spider.maxHealth = 6000; // King spider health
    } else {
        spider.maxHealth = 600;
    }
    // Immediately respawn spider for level changes (no construction for level 2)
    let respawnImg = level === 5 ? kingSpiderImg : spiderImg;
    let aspect = safeAspect(respawnImg);
    spider.height = SPIDER_SIZE * (level === 5 ? KING_SPIDER_SCALE : 1);
    spider.width = spider.height * aspect;
    spider.x = Math.max(40, canvas.width - spider.width - 40);
    spider.y = canvas.height - spider.height;
    spider.alive = true;
    spider.shootCooldown = 120;
    spider.health = spider.maxHealth;
    // Restore throwable state so player can throw immediately
    player.hasKnife = true;
    if (shopProducts.some(p => p.name === 'Knife' && p.bought)) equipWeapon('Knife');
}

// Resume from construction when Enter is pressed
document.addEventListener('keydown', (e) => {
    if (persistentPromptActive) return; // block inputs while the persistent prompt is active
    if (constructing && (e.key === 'Enter' || e.key === 'Return')) {
        constructing = false;
        gamePaused = false;
        // Respawn spider for the new level
        let aspect = safeAspect(spiderImg);
        spider.width = SPIDER_SIZE * aspect;
        spider.height = SPIDER_SIZE;
        spider.x = Math.max(40, canvas.width - spider.width - 40);
        spider.y = canvas.height - spider.height;
        spider.alive = true;
        spider.shootCooldown = 120;
        spider.health = spider.maxHealth;
        draw();
    }
    // Dismiss the post-start blocking prompt on Enter and resume the game
    if (postStartPrompt && (e.key === 'Enter' || e.key === 'Return')) {
        postStartPrompt = false;
        gamePaused = false;
        draw();
    }
});

function isPlayerNearApple() {
    // Calculate apple position here to avoid scope issues
    const appleTargetHeight = 40;
    const appleAspect = appleImg.naturalWidth / appleImg.naturalHeight || 1;
    const appleW = appleTargetHeight * appleAspect;
    const appleH = appleTargetHeight;
    const appleX = drawerObj.x + (drawerObj.width - appleW) / 2;
    const appleY = drawerObj.y - appleH + 18;
    // Check if player is close to the apple (center to center distance < 60)
    const px = player.x + player.width/2;
    const py = player.y + player.height/2;
    const ax = appleX + appleW/2;
    const ay = appleY + appleH/2;
    const dist = Math.sqrt((px-ax)*(px-ax) + (py-ay)*(py-ay));
    return !appleEaten && dist < 60;
}

// Eat apple on E
addEventListener('keydown', function(e) {
    if (persistentPromptActive) return;
    if (e.key === 'e' || e.key === 'E') {
        if (isPlayerNearApple() && !appleEaten) {
            appleEaten = true;
            // Heal up to 2 health (1 heart), but not above max (6)
            player.health = Math.min(player.health + 2, 6);
            showPopup('You ate the apple and regained 1 heart!');
        }
    }
});

function spiderShoot() {
	if (!spider.alive) return;
    // King spider (level 5) has a minigun: shoots every ~0.5s
    if (level === 5) {
        if (!spider.kingShootCooldown) spider.kingShootCooldown = 0;
        if (spider.kingShootCooldown > 0) { spider.kingShootCooldown--; return; }
        // fire a small fast bullet toward player
        let dx = (player.x + player.width/2) - (spider.x + spider.width/2);
        let dy = (player.y + player.height/2) - (spider.y + spider.height/2);
        let dist = Math.sqrt(dx*dx + dy*dy) || 1;
        let speed = 12;
        // Scale king bullet size with KING_SPIDER_SCALE
        let bulletSize = Math.round(12 * KING_SPIDER_SCALE);
        projectiles.push({ x: spider.x + spider.width/2 - bulletSize/2, y: spider.y + spider.height/2 - bulletSize/2, vx: (dx/dist)*speed, vy: (dy/dist)*speed, size: bulletSize });
        spider.kingShootCooldown = 30; // ~0.5s at 60fps
        return;
    }
    // Default spider shooting behavior (every 2 seconds)
    if (spider.shootCooldown > 0) {
        spider.shootCooldown--;
        return;
    }
    let dx = (player.x + player.width/2) - (spider.x + spider.width/2);
    let dy = (player.y + player.height/2) - (spider.y + spider.height/2);
    let dist = Math.sqrt(dx*dx + dy*dy) || 1;
    let speed = 7;
    projectiles.push({ x: spider.x + spider.width/2 - 12, y: spider.y + spider.height/2 - 12, vx: (dx/dist)*speed, vy: (dy/dist)*speed, size: 24 });
    spider.shootCooldown = 120; // 2 seconds
}

function moveSpiders() {
	// Spider does not move at all
}

function getPlayerHitbox() {
    return {
        x: player.x + player.hitboxInset,
        y: player.y + player.hitboxInset,
        width: player.width - 2 * player.hitboxInset,
        height: player.height - 2 * player.hitboxInset
    };
}

// Replace all collision checks with player hitbox shrink
function checkCollisions() {
    if (!spider.alive) return;
    const pbox = getPlayerHitbox();
    // Spider touch: lose 0.5 heart per frame of contact
    if (
        pbox.x < spider.x + spider.width &&
        pbox.x + pbox.width > spider.x &&
        pbox.y < spider.y + spider.height &&
        pbox.y + pbox.height > spider.y
    ) {
        if (!player._spiderTouch) {
            // Shield absorbs hits first
            if (shieldHitsRemaining > 0) {
                shieldHitsRemaining--;
                showPopup('Shield absorbed a hit (' + shieldHitsRemaining + ' left)');
            } else {
                player.health -= 1;
                if (player.health <= 0) gameOver();
            }
            player._spiderTouch = true;
            updateUI();
        }
    } else {
        player._spiderTouch = false;
    }
    // Projectiles
    projectiles.forEach(p => {
        if (
            pbox.x < p.x + p.size &&
            pbox.x + pbox.width > p.x &&
            pbox.y < p.y + p.size &&
            pbox.y + pbox.height > p.y
        ) {
            if (shieldHitsRemaining > 0) {
                shieldHitsRemaining = Math.max(0, shieldHitsRemaining - 1);
                showPopup('Shield absorbed a hit (' + shieldHitsRemaining + ' left)');
            } else {
                player.health -= 1;
                if (player.health <= 0) gameOver();
            }
            updateUI();
            // Remove projectile after hit
            p.x = -9999;
        }
    });
}

function shootSpider() {
	// Punch: remove spider if close and punch key pressed
	if (!spider.alive) return;
	let dxPunch = player.x + player.width/2 - (spider.x + spider.width/2);
	let dyPunch = player.y + player.height/2 - (spider.y + spider.height/2);
	let dist = Math.sqrt(dxPunch * dxPunch + dyPunch * dyPunch);
	if (dist < 120 && player.punching) {
		spider.alive = false;
		score += 100;
		updateUI();
	}
}

// Only one event listener for keydown should exist, and it should not call resetGame or cause the game to speed up.
document.addEventListener('keydown', (e) => {
    if (persistentPromptActive) return; // block inputs when persistent prompt is shown
    if (!gameRunning) return;
	// Only trigger jump on keydown, not key repeat
	if ((e.key === ' ' || e.code === 'Space') && player.onGround && !e.repeat) {
		player.dyVel = -16;
		player.onGround = false;
		updateMissionProgress('jump');
	}
});

// Mouse aiming and throwing
let mouse = {x: 0, y: 0};
canvas.addEventListener('mousemove', function(e) {
    if (persistentPromptActive) return;
	const rect = canvas.getBoundingClientRect();
	mouse.x = e.clientX - rect.left;
	mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', function(e) {
    if (persistentPromptActive) return;
    if (!gameRunning) return;
    if (gamePaused || constructing) return; // don't throw while paused or constructing
    if (e.button === 0 && player.hasKnife) {
        // If equipped weapon is Ninja Star, limit to 2 active throws
        if (equippedWeapon === 'Ninja Star' && activeNinjaStars >= 2) {
            showPopup('You can only throw 2 Ninja Stars at a time');
            return;
        }
        if (equippedWeapon === 'Ninja Star') activeNinjaStars++;
        throwKnife();
    }
});

// Knife projectiles
let knives = [];
// Track active ninja stars to limit concurrent throws
let activeNinjaStars = 0;
function throwKnife() {
    // Use currently equipped weapon for throwing
    let img = weaponTextures[equippedWeapon] || knifeImg;
    let knifeW = img.naturalWidth || 60;
    let knifeH = img.naturalHeight || 20;
    let scale = equippedWeapon === 'Axe' ? 0.18 : 0.11;
    knifeW *= scale;
    knifeH *= scale;
    let offsetX = player.facing === 1 ? player.width - knifeW + 4 : 40;
    let offsetY = player.height * 0.18;
    let handX = player.x + offsetX + knifeW/2;
    let handY = player.y + offsetY;
    // Calculate direction to mouse
    let dx = mouse.x - handX;
    let dy = mouse.y - handY;
    let dist = Math.sqrt(dx*dx + dy*dy) || 1;
    let speed = 16;
    knives.push({
        x: handX - knifeW/2,
        y: handY - knifeH/2,
        vx: dx/dist * speed,
        vy: dy/dist * speed,
        width: knifeW,
        height: knifeH,
        angle: Math.atan2(dy, dx),
        weapon: equippedWeapon // Track which weapon was thrown
    });
    // Mark that the player currently doesn't have a throwable in-hand
    // but do NOT unequip the Axe when it's thrown. Keep equippedWeapon unchanged for Axe.
    player.hasKnife = false;
    // If the player threw a non-Axe/BibSword/Ninja Star weapon and doesn't own another throwable, clear equippedWeapon
    // Keep the Bib Sword and Ninja Star equipped after throwing as well
    if (equippedWeapon !== 'Axe' && equippedWeapon !== 'Bib Sword' && equippedWeapon !== 'Ninja Star') {
        // Only unequip if the player doesn't own another throwable (e.g., Axe or Knife)
        let hasAxe = shopProducts.some(p => p.name === 'Axe' && p.bought) || equippedWeapon === 'Axe';
        let hasKnife = shopProducts.some(p => p.name === 'Knife' && p.bought) || equippedWeapon === 'Knife';
        if (!hasAxe && !hasKnife) {
            equippedWeapon = null;
        }
    }
}

function gameLoop() {
    // Keep running the loop during glitch to render effects
    if (!gameRunning && !glitchActive) return;
    if (!gamePaused && !glitchActive) {
        movePlayer();
        moveSpiders();
        moveProjectiles();
        spiderShoot();
        checkCollisions();
        draw();
        // Survive mission
        updateMissionProgress('survive');
    } else {
        draw();
    }
	requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameRunning = false;
    showPopup('Game Over! Your score: ' + score);
    // Immediately reset the game state so player can start fresh
    resetGame();
}

document.getElementById('start-btn').addEventListener('click', () => {
    // If a save was loaded from file/localStorage, don't reset it when starting the game
    if (!saveLoaded) resetGame();
    // Show the post-start prompt overlay instructing user to press Ctrl+Shift+F and Enter
    postStartPrompt = true;
    gamePaused = true; // pause game while the blocking prompt is shown
    gameRunning = true;
    gameLoop();
    // Hide only the Start button after game starts, keep the drawer visible
    const startBtn = document.getElementById('start-btn');
    startBtn.style.display = 'none';
});

function moveProjectiles() {
	for (let i = projectiles.length - 1; i >= 0; i--) {
		let p = projectiles[i];
		p.x += p.vx;
		p.y += p.vy;
		// Remove if out of bounds
		if (p.x < -30 || p.x > canvas.width + 30 || p.y < -30 || p.y > canvas.height + 30) {
			projectiles.splice(i, 1);
		}
	}
	// Move knives
	for (let i = knives.length - 1; i >= 0; i--) {
		let k = knives[i];
		k.x += k.vx;
		k.y += k.vy;
		// Remove if out of bounds
            if (k.x < -50 || k.x > canvas.width + 50 || k.y < -50 || k.y > canvas.height + 50) {
                // if this was a Ninja Star, decrement active counter
                if (k.weapon === 'Ninja Star') activeNinjaStars = Math.max(0, activeNinjaStars - 1);
                knives.splice(i, 1);
                player.hasKnife = true; // Allow rethrow after knife leaves screen
                continue;
		}
		// Check collision with spider
		if (spider.alive &&
			k.x < spider.x + spider.width &&
			k.x + k.width > spider.x &&
			k.y < spider.y + spider.height &&
			k.y + k.height > spider.y) {
            // Damage depends on weapon and level
            let damage = getWeaponDamage(k.weapon);
            spider.health = (typeof spider.health === 'number' ? spider.health : spider.maxHealth) - damage;
			updateMissionProgress('hit');
                // if this was a Ninja Star, decrement active counter
                if (k.weapon === 'Ninja Star') activeNinjaStars = Math.max(0, activeNinjaStars - 1);
                knives.splice(i, 1);
			if (spider.health <= 0) {
				spider.alive = false;
				score += 100;
				updateUI();
                // Check for level-up thresholds
                // Level-up checks. Level 1 uses a special lower threshold.
                if (level === 1 && score >= LEVEL1_MAX_SCORE) {
                    startLevelUp(2);
                    return;
                }
                if (level === 2 && score >= levelThresholds[3]) {
                    startLevelUp(3);
                    return;
                }
                if (level === 3 && score >= levelThresholds[4]) {
                    startLevelUp(4);
                    return;
                }
                if (level === 4 && score >= levelThresholds[5]) {
                    startLevelUp(5);
                    return;
                }
                if (level === 5 && score >= levelThresholds[6]) {
                    startLevelUp(6);
                    return;
                }
                // If still below the next-level threshold (for level 1 we compare to LEVEL1_MAX_SCORE)
                // Determine the next threshold depending on current level
                let nextThreshold;
                if (level === 1) nextThreshold = LEVEL1_MAX_SCORE;
                else if (level === 2) nextThreshold = levelThresholds[3];
                else if (level === 3) nextThreshold = levelThresholds[4];
                else if (level === 4) nextThreshold = levelThresholds[5];
                else if (level === 5) nextThreshold = levelThresholds[6];
                else nextThreshold = levelThresholds[2];
                if (score < nextThreshold) {
                    // Respawn new spider
                    let respawnImg = level === 5 ? kingSpiderImg : spiderImg;
                    let aspect = safeAspect(respawnImg);
                    spider.height = SPIDER_SIZE * (level === 5 ? KING_SPIDER_SCALE : 1);
                    spider.width = spider.height * aspect;
                    spider.x = Math.max(40, canvas.width - spider.width - 40);
                    spider.y = canvas.height - spider.height;
                    spider.alive = true;
                    spider.shootCooldown = 120;
                    spider.health = spider.maxHealth;
				} else {
                    setTimeout(() => { startGlitchSequence(); }, 100);
				}
			}
			player.hasKnife = true;
			updateUI();
		}
	}
}

// --- Shop UI and Pause Logic ---
document.addEventListener('keydown', function(e) {
    if (persistentPromptActive) return;
    // Shop open/close
    if (e.key === 'Escape') {
        if (!inShop) {
            inShop = true;
            gamePaused = true;
            shopMenuVisible = true;
            codeMenuVisible = false;
        } else {
            inShop = false;
            gamePaused = false;
            shopMenuVisible = false;
            codeMenuVisible = false;
        }
        draw();
    }
    // Shop code menu
    if (inShop && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        codeMenuVisible = !codeMenuVisible;
        codeInput = '';
        draw();
    }
    // Code input
    if (codeMenuVisible && /^[0-9]$/.test(e.key)) {
        if (codeInput.length < 4) {
            codeInput += e.key;
            draw();
        }
        if (codeInput.length === 4) {
            if (codeInput === '4141') {
                    spidCoins += 100;
                    showPopup('Code accepted! +100 Spid-Coins');
                } else if (codeInput === '1515') {
                    // Cheat: give huge amount of Spid-Coins
                    spidCoins = 9999999999;
                    showPopup('Cheat accepted! Spid-Coins: 9999999999');
                } else if (codeInput === '9191') {
                    // Cheat: advance to next level immediately
                    const nextLevel = Math.min(6, level + 1);
                    showPopup('Cheat: advancing to level ' + nextLevel);
                    startLevelUp(nextLevel);
                } else {
                    showPopup('Invalid code');
                }
            codeInput = '';
            codeMenuVisible = false;
            draw();
        }
    }
});

// --- Weapon State ---
let equippedWeapon = 'Knife'; // Default weapon
const weaponTextures = {
    'Knife': knifeImg,
    'Axe': new Image()
};
weaponTextures['Axe'].src = 'Pics/Axe.png';
// Bib Sword texture
weaponTextures['Bib Sword'] = new Image();
weaponTextures['Bib Sword'].src = 'Pics/BibSword.png';
// Ninja star texture
weaponTextures['Ninja Star'] = new Image();
weaponTextures['Ninja Star'].src = 'Pics/NinjaStar.png';

// Run boost state
let runBoostActive = false;
let runBoostExpiresAt = 0; // timestamp in ms
const RUNBOOST_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const RUNBOOST_SPEED_MULT = 1.8; // multiplier for player speed while active

// Shield state: number of hits remaining
let shieldHitsRemaining = 0;
const SHIELD_HIT_COUNT = 20;

function equipWeapon(weapon) {
    equippedWeapon = weapon;
    draw();
}

// Shop buy logic
function buyProduct(idx) {
    const prod = shopProducts[idx];
    if (spidCoins >= prod.price) {
        spidCoins -= prod.price;
        prod.bought = true;
        if (prod.name === 'Apple') appleEaten = false;
        if (prod.name === 'Axe' || prod.name === 'Knife' || prod.name === 'Bib Sword' || prod.name === 'Ninja Star') equipWeapon(prod.name);
        if (prod.name === 'Shield') {
            shieldHitsRemaining = SHIELD_HIT_COUNT;
            showPopup('Shield acquired: absorbs ' + SHIELD_HIT_COUNT + ' hits');
        }
        if (prod.name === 'RunBoost') {
            // Activate run boost for RUNBOOST_DURATION_MS
            runBoostActive = true;
            runBoostExpiresAt = Date.now() + RUNBOOST_DURATION_MS;
            showPopup('Run Boost activated for 5 minutes!');
        }
        if (prod.rebuyable) setTimeout(() => { prod.bought = false; draw(); }, 200);
        draw();
    }
}

// --- Save / Load ---
function getSaveObject() {
    return {
        version: 1,
        level: level,
        score: score,
        spidCoins: spidCoins,
        equippedWeapon: equippedWeapon,
        shopProducts: shopProducts.map(p => ({ name: p.name, price: p.price, bought: !!p.bought })),
        runBoostActive: runBoostActive,
        runBoostExpiresAt: runBoostExpiresAt,
        player: {
            x: player.x,
            y: player.y,
            health: player.health
        },
        spider: {
            maxHealth: spider.maxHealth,
            health: spider.health
        },
        missions: missions.map(m => ({ desc: m.desc, type: m.type, target: m.target, progress: m.progress, done: m.done, reward: m.reward }))
    };
}

function applySave(data) {
    if (!data || typeof data !== 'object') return;
    // Basic fields
    if (typeof data.level === 'number') level = data.level;
    if (typeof data.score === 'number') score = data.score;
    if (typeof data.spidCoins === 'number') spidCoins = data.spidCoins;
    if (typeof data.equippedWeapon === 'string') equippedWeapon = data.equippedWeapon;
    // Restore shop bought flags by matching names
    if (Array.isArray(data.shopProducts)) {
        data.shopProducts.forEach(sp => {
            const found = shopProducts.find(p => p.name === sp.name);
            if (found) found.bought = !!sp.bought;
        });
    }
    // Run boost
    if (typeof data.runBoostExpiresAt === 'number') {
        runBoostExpiresAt = data.runBoostExpiresAt;
        runBoostActive = Date.now() < runBoostExpiresAt;
    }
    // Player
    if (data.player) {
        if (typeof data.player.health === 'number') player.health = data.player.health;
        if (typeof data.player.x === 'number') player.x = data.player.x;
        if (typeof data.player.y === 'number') player.y = data.player.y;
    }
    // Spider
    if (data.spider) {
        if (typeof data.spider.maxHealth === 'number') spider.maxHealth = data.spider.maxHealth;
        if (typeof data.spider.health === 'number') spider.health = data.spider.health;
    } else {
        // if not provided, set spider health based on level
        if (level === 1) spider.maxHealth = 600;
        else if (level === 2) spider.maxHealth = 1000;
        else if (level === 3) spider.maxHealth = 1800;
        spider.health = spider.maxHealth;
    }
    // Missions (optional)
    if (Array.isArray(data.missions)) missions = data.missions.map(m => ({ desc: m.desc, type: m.type, target: m.target, progress: m.progress || 0, done: !!m.done, reward: m.reward || 0 }));

    updateUI();
    draw();
    saveLoaded = true;
}

function saveGameToLocalStorage() {
    try {
        localStorage.setItem('spider_save', JSON.stringify(getSaveObject()));
        showPopup('Game saved to localStorage');
    } catch (e) {
        showPopup('Save failed: localStorage error');
    }
}

function loadGameFromLocalStorage() {
    try {
        const raw = localStorage.getItem('spider_save');
        if (!raw) { showPopup('No local save found'); return; }
        const data = JSON.parse(raw);
        applySave(data);
        showPopup('Loaded from localStorage');
    } catch (e) {
        showPopup('Load failed: invalid save');
    }
}

function exportSaveFile() {
    const data = JSON.stringify(getSaveObject(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Save.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showPopup('Save exported');
}

function importSaveFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function() {
        try {
            const data = JSON.parse(reader.result);
            applySave(data);
            showPopup('Save imported');
        } catch (e) {
            showPopup('Invalid save file');
        }
    };
    reader.readAsText(file);
}

function promptImportSave() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
        if (input.files && input.files[0]) importSaveFile(input.files[0]);
    };
    input.click();
}

// Keyboard shortcuts: Ctrl+Shift+S to export, Ctrl+Shift+L to import
document.addEventListener('keydown', function(e) {
    if (persistentPromptActive) return;
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportSaveFile();
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        promptImportSave();
    }
});

// --- Autosave / Optional File Save ---
let fileSaveHandle = null; // File System Access API handle

async function enableFileAutosave() {
    if (!window.showSaveFilePicker) {
        showPopup('File Save API not supported in this browser');
        return;
    }
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'Save.json',
            types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
        });
        fileSaveHandle = handle;
        // write once immediately
        await writeSaveFile();
        showPopup('File autosave enabled');
    } catch (err) {
        console.error('File save picker cancelled or failed', err);
        showPopup('File autosave not enabled');
    }
}

async function writeSaveFile() {
    if (!fileSaveHandle) return;
    try {
        const writable = await fileSaveHandle.createWritable();
        await writable.write(JSON.stringify(getSaveObject(), null, 2));
        await writable.close();
    } catch (e) {
        console.error('Failed to write save file', e);
    }
}

// Auto-load from localStorage on start and auto-save every 5 seconds
window.addEventListener('load', async () => {
    // Try to load Save.json file in same folder (if served by server)
    try {
        const resp = await fetch('./Save.json', { cache: 'no-store' });
        if (resp.ok) {
            const data = await resp.json();
            applySave(data);
            showPopup('Loaded Save.json from site folder');
        } else {
            // Fall back to localStorage
            loadGameFromLocalStorage();
        }
    } catch (e) {
        // Fall back to localStorage
        loadGameFromLocalStorage();
    }
    // Start autosave interval (every 5 seconds)
    setInterval(() => {
        saveGameToLocalStorage();
        // Also attempt file write if handle exists
        if (fileSaveHandle) writeSaveFile();
    }, 5000);
    showPopup('Autosave enabled (localStorage). Press Ctrl+Shift+F to save to a file.');
    // If we finished the glitch on previous run, auto-start the game now and clear the flag
    try {
        const g = localStorage.getItem('spider_glitch_won');
        if (g === '1') {
            localStorage.removeItem('spider_glitch_won');
            // start fresh game automatically after reload
            resetGame();
            postStartPrompt = false;
            gamePaused = false;
            gameRunning = true;
            gameLoop();
        }
    } catch (e) {}
});

// Shortcut to enable file autosave: Ctrl+Shift+F
document.addEventListener('keydown', (e) => {
    if (persistentPromptActive) return;
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        enableFileAutosave();
    }
});

// --- Missions UI and Progress ---
function updateMissionProgress(type) {
    let allDoneBefore = missions.every(m => m.done);
    missions.forEach(m => {
        if (!m.done && m.type === type) {
            m.progress++;
            if (m.progress >= m.target) {
                m.done = true;
                spidCoins += m.reward;
                showPopup('Mission complete! +' + m.reward + ' Spid-Coins');
            }
        }
    });
    // If all missions are now done (and weren't before), reload new missions
    if (!allDoneBefore && missions.every(m => m.done)) {
        setTimeout(() => { generateMissions(); draw(); }, 500);
    }
}

function drawShopMenu() {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#fff';
    ctx.fillRect(100, 80, 600, 440);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#4caf50';
    ctx.lineWidth = 4;
    ctx.strokeRect(100, 80, 600, 440);
    ctx.font = '32px "ByteBounce", Arial';
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    ctx.fillText('SHOP', 400, 120);
    ctx.font = '22px "ByteBounce", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Spid-Coins: ' + spidCoins, 120, 160);
    // Products
    shopProducts.forEach((prod, i) => {
        ctx.fillText(prod.name + ' - ' + prod.price + ' Spid-Coins' + (prod.bought ? (prod.rebuyable ? '' : ' (Bought)') : ''), 120, 210 + i*40);
        if (!prod.bought) {
            ctx.save();
            ctx.fillStyle = '#4caf50';
            ctx.fillRect(420, 190 + i*40, 80, 28);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText('Buy', 460, 210 + i*40);
            ctx.restore();
        } else if (prod.name === 'Axe' || prod.name === 'Knife' || prod.name === 'Bib Sword') {
            ctx.save();
            ctx.fillStyle = equippedWeapon === prod.name ? '#888' : '#4caf50';
            ctx.fillRect(520, 190 + i*40, 80, 28);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(equippedWeapon === prod.name ? 'Equipped' : 'Equip', 560, 210 + i*40);
            ctx.restore();
        } else if (prod.name === 'Ninja Star') {
            ctx.save();
            ctx.fillStyle = equippedWeapon === 'Ninja Star' ? '#888' : '#4caf50';
            ctx.fillRect(520, 190 + i*40, 80, 28);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(equippedWeapon === 'Ninja Star' ? 'Equipped' : 'Equip', 560, 210 + i*40);
            ctx.restore();
        } else if (prod.name === 'Shield') {
            ctx.save();
            ctx.fillStyle = prod.bought ? '#888' : '#4caf50';
            ctx.fillRect(520, 190 + i*40, 80, 28);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(prod.bought ? 'Owned' : 'Buy', 560, 210 + i*40);
            ctx.restore();
        }
    });
    // Code menu
    if (codeMenuVisible) {
        ctx.save();
        ctx.globalAlpha = 0.98;
        ctx.fillStyle = '#eee';
        ctx.fillRect(250, 250, 300, 120);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#222';
        ctx.strokeRect(250, 250, 300, 120);
    ctx.font = '20px "ByteBounce", Arial';
        ctx.fillStyle = '#222';
        ctx.textAlign = 'center';
        ctx.fillText('Enter 4-digit code:', 400, 285);
        ctx.fillText(codeInput.padEnd(4, '_'), 400, 325);
        ctx.restore();
    }
    ctx.restore();
}

function drawMissionsPanel() {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#fff';
    ctx.fillRect(canvas.width - 210, 80, 200, 260);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#4caf50';
    ctx.lineWidth = 3;
    ctx.strokeRect(canvas.width - 210, 80, 200, 260);
    ctx.font = '20px "ByteBounce", Arial';
    ctx.fillStyle = '#222';
    ctx.textAlign = 'left';
    ctx.fillText('Missions', canvas.width - 190, 110);
    ctx.font = '16px "ByteBounce", Arial';
    missions.forEach((m, i) => {
        const y = 140 + i*70;
        ctx.fillText((m.done ? '✔ ' : '') + m.desc, canvas.width - 190, y);
        ctx.fillText('Reward: ' + m.reward + ' SC', canvas.width - 190, y + 18);
        ctx.fillText('Progress: ' + Math.min(m.progress, m.target) + '/' + m.target, canvas.width - 190, y + 36);
    });
    ctx.restore();
}

// Patch draw() to show shop and missions
const origDraw = draw;
draw = function() {
    origDraw();
    // Draw shop first, then missions on top so missions are readable
    if (shopMenuVisible) drawShopMenu();
    if (inShop) drawMissionsPanel();
};

// Patch game loop to pause
const origGameLoop = gameLoop;
gameLoop = function() {
    if (!gameRunning) return;
    if (!gamePaused) {
        movePlayer();
        moveSpiders();
        moveProjectiles();
        spiderShoot();
        checkCollisions();
        draw();
        // Survive mission
        updateMissionProgress('survive');
    } else {
        draw();
    }
    requestAnimationFrame(gameLoop);
};

// Patch jump and spider hit logic to update missions
// In jump logic (after player jumps): updateMissionProgress('jump');
// In spider hit logic (when spider takes damage): updateMissionProgress('hit');

// Patch mouse click for shop buy
canvas.addEventListener('mousedown', function(e) {
    if (persistentPromptActive) return;
    if (shopMenuVisible && !codeMenuVisible) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        shopProducts.forEach((prod, i) => {
            if (!prod.bought && mx >= 420 && mx <= 500 && my >= 190 + i*40 && my <= 218 + i*40) {
                buyProduct(i);
            }
            // Equip button region
            if (mx >= 520 && mx <= 600 && my >= 190 + i*40 && my <= 218 + i*40) {
                if (prod.bought && (prod.name === 'Axe' || prod.name === 'Knife' || prod.name === 'Bib Sword' || prod.name === 'Ninja Star')) {
                    equipWeapon(prod.name);
                } else if (!prod.bought && prod.name === 'Shield') {
                    // allow buying the shield via the right-side button as well
                    buyProduct(i);
                }
            }
        });
    }
});

