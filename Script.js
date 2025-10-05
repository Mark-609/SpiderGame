// --- Game Constants ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const PLAYER_SPEED = 5;
const SPIDER_SPEED = 2;


const PLAYER_SIZE = 96;
const SPIDER_SIZE = 96;

// --- Load Images ---
const playerImg = new Image();
playerImg.src = 'Pics/Player.png';
const spiderImg = new Image();
spiderImg.src = 'Pics/NormalSpider.png';
const knifeImg = new Image();
knifeImg.src = 'Pics/Knife.png';
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
document.addEventListener('keydown', (e) => { keys[e.key] = true; });
document.addEventListener('keyup', (e) => { keys[e.key] = false; });

let player = { x: 40, y: (canvas ? canvas.height - PLAYER_SIZE : 0), width: PLAYER_SIZE, height: PLAYER_SIZE, dx: 0, dy: 0, dyVel: 0, onGround: true, facing: 1, hasKnife: true, hitboxInset: 16 };
let spider = { x: 0, y: 0, width: SPIDER_SIZE, height: SPIDER_SIZE, alive: true, shootCooldown: 0 };
let projectiles = [];
let score = 0;
let gameRunning = false;

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
    { name: 'Knife', price: 100, bought: false, rebuyable: false }
];
let missions = [];

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
    // Calculate spider width based on image aspect ratio
    let aspect = spiderImg.naturalWidth / spiderImg.naturalHeight || 1;
    spider.width = SPIDER_SIZE * aspect;
    spider.height = SPIDER_SIZE;
    spider.x = canvas.width - spider.width - 40;
    spider.y = canvas.height - spider.height;
    spider.alive = true;
    spider.shootCooldown = 120; // 2 seconds at 60fps
    spider.health = 6;
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
}

function updateUI() {
	document.getElementById('score').textContent = 'Score: ' + score;
}

function movePlayer() {
    player.dx = 0;
    // Only left/right
    if (keys['ArrowLeft'] || keys['a']) {
        player.dx = -PLAYER_SPEED;
        player.facing = -1;
    }
    if (keys['ArrowRight'] || keys['d']) {
        player.dx = PLAYER_SPEED;
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
            ctx.font = '22px Arial';
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
		let aspect = spiderImg.naturalWidth / spiderImg.naturalHeight || 1;
		let spiderDrawHeight = SPIDER_SIZE;
		let spiderDrawWidth = SPIDER_SIZE * aspect;
		ctx.drawImage(
			spiderImg,
			spider.x,
			spider.y,
			spiderDrawWidth,
			spiderDrawHeight
		);
		// Draw spider shoot countdown
		ctx.save();
		ctx.font = '24px Arial';
		ctx.fillStyle = '#222';
		ctx.textAlign = 'center';
		let seconds = Math.ceil(spider.shootCooldown / 60);
		if (spider.shootCooldown > 0) {
			ctx.fillText(seconds, spider.x + spiderDrawWidth/2, spider.y - 10);
		}
		ctx.restore();
	}
	// Draw projectiles
	ctx.fillStyle = '#c00';
	projectiles.forEach(p => {
		ctx.beginPath();
		ctx.arc(p.x + p.size/2, p.y + p.size/2, p.size/2, 0, 2 * Math.PI);
		ctx.fill();
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
}

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
    if (e.key === 'e' || e.key === 'E') {
        if (isPlayerNearApple() && !appleEaten) {
            appleEaten = true;
            // Heal up to 2 health (1 heart), but not above max (6)
            player.health = Math.min(player.health + 2, 6);
            alert('You ate the apple and regained 1 heart!');
        }
    }
});

function spiderShoot() {
	if (!spider.alive) return;
	if (spider.shootCooldown > 0) {
		spider.shootCooldown--;
		return;
	}
	// Shoot every 2 seconds
	let dx = (player.x + player.width/2) - (spider.x + spider.width/2);
	let dy = (player.y + player.height/2) - (spider.y + spider.height/2);
	let dist = Math.sqrt(dx*dx + dy*dy);
	let speed = 7;
	projectiles.push({
		x: spider.x + spider.width/2 - 12,
		y: spider.y + spider.height/2 - 12,
		vx: (dx/dist)*speed,
		vy: (dy/dist)*speed,
		size: 24
	});
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
            player.health -= 1;
            player._spiderTouch = true;
            if (player.health <= 0) gameOver();
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
            player.health -= 1;
            if (player.health <= 0) gameOver();
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
	const rect = canvas.getBoundingClientRect();
	mouse.x = e.clientX - rect.left;
	mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', function(e) {
	if (!gameRunning) return;
	if (e.button === 0 && player.hasKnife) {
		throwKnife();
	}
});

// Knife projectiles
let knives = [];
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
    player.hasKnife = false;
    // If axe was thrown, unequip it and switch to knife if owned
    if (equippedWeapon === 'Axe') {
        // Only unequip if player owns knife
        let knifeProd = shopProducts.find(p => p.name === 'Knife' && p.bought);
        if (knifeProd) equipWeapon('Knife');
        else equippedWeapon = null;
    }
}

function gameLoop() {
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
}

function gameOver() {
	gameRunning = false;
	alert('Game Over! Your score: ' + score);
}

document.getElementById('start-btn').addEventListener('click', () => {
	resetGame();
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
			spider.health = (spider.health || 6) - 1;
			updateMissionProgress('hit');
			knives.splice(i, 1);
			if (spider.health <= 0) {
				spider.alive = false;
				score += 100;
				updateUI();
				if (score < 600) {
					// Respawn new spider
					let aspect = spiderImg.naturalWidth / spiderImg.naturalHeight || 1;
					spider.width = SPIDER_SIZE * aspect;
					spider.height = SPIDER_SIZE;
					spider.x = canvas.width - spider.width - 40;
					spider.y = canvas.height - spider.height;
					spider.alive = true;
					spider.shootCooldown = 120;
					spider.health = 6;
				} else {
					setTimeout(() => { alert('You win! Final score: ' + score); gameRunning = false; }, 100);
				}
			}
			player.hasKnife = true;
			updateUI();
		}
	}
}

// --- Shop UI and Pause Logic ---
document.addEventListener('keydown', function(e) {
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
                alert('Code accepted! +100 Spid-Coins');
            } else {
                alert('Invalid code');
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
        if (prod.name === 'Axe' || prod.name === 'Knife') equipWeapon(prod.name);
        if (prod.rebuyable) setTimeout(() => { prod.bought = false; draw(); }, 200);
        draw();
    }
}

// --- Missions UI and Progress ---
function updateMissionProgress(type) {
    let allDoneBefore = missions.every(m => m.done);
    missions.forEach(m => {
        if (!m.done && m.type === type) {
            m.progress++;
            if (m.progress >= m.target) {
                m.done = true;
                spidCoins += m.reward;
                alert('Mission complete! +' + m.reward + ' Spid-Coins');
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
    ctx.font = '32px Arial';
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    ctx.fillText('SHOP', 400, 120);
    ctx.font = '22px Arial';
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
        } else if (prod.name === 'Axe' || prod.name === 'Knife') {
            ctx.save();
            ctx.fillStyle = equippedWeapon === prod.name ? '#888' : '#4caf50';
            ctx.fillRect(520, 190 + i*40, 80, 28);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(equippedWeapon === prod.name ? 'Equipped' : 'Equip', 560, 210 + i*40);
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
        ctx.font = '20px Arial';
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
    ctx.font = '20px Arial';
    ctx.fillStyle = '#222';
    ctx.textAlign = 'left';
    ctx.fillText('Missions', canvas.width - 190, 110);
    ctx.font = '16px Arial';
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
    drawMissionsPanel();
    if (shopMenuVisible) drawShopMenu();
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
    if (shopMenuVisible && !codeMenuVisible) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        shopProducts.forEach((prod, i) => {
            if (!prod.bought && mx >= 420 && mx <= 500 && my >= 190 + i*40 && my <= 218 + i*40) {
                buyProduct(i);
            }
            if (
                prod.bought && (prod.name === 'Axe' || prod.name === 'Knife') &&
                mx >= 520 && mx <= 600 &&
                my >= 190 + i*40 && my <= 218 + i*40
            ) {
                equipWeapon(prod.name);
            }
        });
    }
});

