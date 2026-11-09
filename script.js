const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const phaseTitle = document.getElementById('phase-title');
const infoUI = document.getElementById('info');

// --- 1. CONFIGURACIÓN DE JUEGO Y NIVELES (6 NIVELES) ---
let currentLevel = 1;
const maxLevels = 10;
let gameOver = false;
let particles = [];
// V1.3: anillos visuales de recolección; no intervienen en la lógica del juego.
let collectionRings = [];
// V1.5: anillos de impacto/estallido exclusivamente visuales.
let impactRings = [];
// Misiones adicionales (niveles 7-9). Los niveles 1-6 mantienen su logica original.
let missionState = { type: null, progress: 0, target: 0, completed: false, zones: [], home: null };

// --- Estado de interfaz y modos ---
let juegoIniciado = false;
let juegoPausado = false;
let modoJuego = 1; // 1 = individual, 2 = cooperativo
let totalPolenAcumuladoPartida = 0;
let screenShakeTimer = 0;
let floatingTexts = [];
let highscore = Number(localStorage.getItem('ecobeeHighscore') || 0);
let audioContext = null;


// Jugador Principal (Abeja 1)
const bee = {
  x: 60, y: 200,
  w: 45, h: 45,
  speed: 4, baseSpeed: 4,
  lives: 3, pollenCount: 0,
  invulnerableTimer: 0,
  color: '#f1c40f'
};

// Segundo Jugador (Cooperativo local para pruebas / preparado para WebSockets)
const bee2 = {
  x: 60, y: 260,
  w: 45, h: 45,
  speed: 4,
  pollenCount: 0,
  color: '#e67e22',
  invulnerableTimer: 0
};

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === 'Escape' && juegoIniciado) {
    togglePausa();
    return;
  }
  if (gameOver && (e.code === 'Space' || e.key === ' ')) {
    reiniciarJuegoCompleto();
  }
});
window.addEventListener('keyup', e => keys[e.key] = false);

function getRandomPoint(minX = 180, maxX = 720, minY = 80, maxY = 370) {
  return {
    x: Math.floor(Math.random() * (maxX - minX + 1)) + minX,
    y: Math.floor(Math.random() * (maxY - minY + 1)) + minY,
    active: true
  };
}

function createParticles(x, y, color = '#f39c12') {
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      alpha: 1, color: color,
      size: Math.random() * 4 + 2
    });
  }
}

// CAM-VISUAL-07: destello circular y pequeñas chispas al recoger polen.
// Efecto exclusivamente visual: no modifica puntuación, colisiones ni tiempos.
function crearEfectoRecoleccionPolen(x, y, color = '#ffd54a', dorado = false) {
  collectionRings.push({ x, y, radius: dorado ? 5 : 3, alpha: 0.9, color, speed: dorado ? 3.1 : 2.4, lineWidth: dorado ? 3 : 2 });
  const cantidad = dorado ? 18 : 10;
  for (let i = 0; i < cantidad; i++) {
    const angulo = (Math.PI * 2 * i / cantidad) + Math.random() * 0.25;
    const velocidad = (dorado ? 2.2 : 1.4) + Math.random() * 1.8;
    particles.push({
      x, y, vx: Math.cos(angulo) * velocidad, vy: Math.sin(angulo) * velocidad - 0.6,
      alpha: 1, color: i % 3 === 0 ? '#fff7b2' : color,
      size: (dorado ? 2.5 : 1.7) + Math.random() * (dorado ? 2.5 : 1.5),
      gravity: 0.025, sparkle: true
    });
  }
}

// CAM-VISUAL-08: impacto, daño y estallido visual al chocar con un enemigo.
// No destruye ni retira enemigos y no modifica daño, vidas, colisiones o puntuación.
function crearEfectoImpacto(x, y, tipo = 'impacto') {
  const esDano = tipo === 'daño';
  const color = esDano ? '#ff4d5a' : '#ffd166';
  impactRings.push({ x, y, radius: 4, alpha: 0.95, color, speed: esDano ? 3.6 : 4.4, lineWidth: esDano ? 3 : 2.5 });
  impactRings.push({ x, y, radius: 2, alpha: 0.82, color: '#ffffff', speed: esDano ? 2.5 : 3.2, lineWidth: 1.5 });

  const cantidad = esDano ? 16 : 22;
  for (let i = 0; i < cantidad; i++) {
    const angulo = (Math.PI * 2 * i / cantidad) + (Math.random() - 0.5) * 0.24;
    const velocidad = (esDano ? 1.5 : 2.0) + Math.random() * (esDano ? 3.0 : 3.8);
    particles.push({
      x, y,
      vx: Math.cos(angulo) * velocidad,
      vy: Math.sin(angulo) * velocidad,
      alpha: 1, color: i % 4 === 0 ? '#ffffff' : (i % 3 === 0 ? color : (esDano ? '#ff8b94' : '#ff9f43')),
      size: 2 + Math.random() * (esDano ? 2.4 : 3.2),
      gravity: 0.035, impact: true,
      angle: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.22
    });
  }
}

function getLevelConfig(level) {
  let speedMult = (1 + (level - 1) * 0.25) * 0.80; // Ajuste de jugabilidad: 20% menos velocidad, conserva la progresión

  switch (level) {
    case 1:
      return {
        title: "Nivel 1: El Jardín Urbano (Modo Cooperativo)",
        info: "Recolecten todo el polen en equipo esquivando los aspersores.",
        tipoFondo: "urbano",
        wind: { x: 0, y: 0 },
        items: Array.from({length: 8}, () => getRandomPoint()),
        enemies: [{ x: 350, y: 100, w: 50, h: 50, sx: 0, sy: 2 * speedMult, tipo: "aspersor" }],
        metaPolen: 8
      };
    case 2:
      return {
        title: "Nivel 2: Los Campos de Cultivo",
        info: "Cuidado con las corrientes de viento y las gotas de pesticida industrial.",
        tipoFondo: "cultivo",
        wind: { x: -0.3, y: 0 },
        items: Array.from({length: 10}, () => getRandomPoint()),
        enemies: [
          { x: 250, y: 50, w: 45, h: 45, sx: 0, sy: 2.5 * speedMult, tipo: "pesticida" },
          { x: 550, y: 300, w: 45, h: 45, sx: 0, sy: -3 * speedMult, tipo: "pesticida" }
        ],
        metaPolen: 10
      };
    case 3:
      return {
        title: "Nivel 3: El Bosque Nativo",
        info: "Protejan la biodiversidad ancestral superando avispas veloces.",
        tipoFondo: "bosque",
        wind: { x: 0.4, y: -0.2 },
        items: Array.from({length: 12}, () => getRandomPoint()),
        enemies: [
          { x: 300, y: 80, w: 50, h: 50, sx: 2 * speedMult, sy: 2.5 * speedMult, tipo: "avispa" },
          { x: 500, y: 250, w: 50, h: 50, sx: -2 * speedMult, sy: -2 * speedMult, tipo: "avispa" }
        ],
        metaPolen: 12
      };
    case 4:
      return {
        title: "Nivel 4: Valle de los Girasoles Gigantes",
        info: "El viento arrecia y los campos exigen mayor coordinación.",
        tipoFondo: "urbano",
        wind: { x: -0.5, y: 0.2 },
        items: Array.from({length: 14}, () => getRandomPoint()),
        enemies: [
          { x: 200, y: 100, w: 45, h: 45, sx: 1.5 * speedMult, sy: 3 * speedMult, tipo: "pesticida" },
          { x: 650, y: 300, w: 50, h: 50, sx: 0, sy: -3.5 * speedMult, tipo: "avispa" }
        ],
        metaPolen: 14
      };
    case 5:
      return {
        title: "Nivel 5: Zona de Alta Contaminación",
        info: "Peligro extremo de agroquímicos. Mantengan el control de vuelo.",
        tipoFondo: "cultivo",
        wind: { x: 0, y: -0.4 },
        items: Array.from({length: 16}, () => getRandomPoint()),
        enemies: [
          { x: 180, y: 80, w: 45, h: 45, sx: 2.5 * speedMult, sy: 3.5 * speedMult, tipo: "pesticida" },
          { x: 400, y: 200, w: 50, h: 50, sx: -2.5 * speedMult, sy: -3 * speedMult, tipo: "avispa" }
        ],
        metaPolen: 16
      };
    case 6:
      return {
        title: "Nivel 6: El Santuario de la Reina",
        info: "El último bastión. Demuestren su destreza en equipo para salvar el colmenar.",
        tipoFondo: "bosque",
        wind: { x: 0.6, y: -0.5 },
        items: Array.from({length: 18}, () => getRandomPoint()),
        enemies: [
          { x: 250, y: 60, w: 50, h: 50, sx: 3 * speedMult, sy: 4 * speedMult, tipo: "avispa" },
          { x: 550, y: 200, w: 45, h: 45, sx: -3 * speedMult, sy: -3.5 * speedMult, tipo: "pesticida" }
        ],
        metaPolen: 18
      };
    case 7:
      return {
        title: "Nivel 7: Rescate del Jardín 🌱",
        info: "Recolecten 10 de polen y visiten las 3 zonas de rescate.",
        tipoFondo: "urbano",
        wind: { x: -0.2, y: 0.1 },
        items: Array.from({length: 10}, () => getRandomPoint()),
        enemies: [
          { x: 260, y: 90, w: 45, h: 45, sx: 1.4 * speedMult, sy: 2.2 * speedMult, tipo: "pesticida" },
          { x: 560, y: 260, w: 50, h: 50, sx: -1.8 * speedMult, sy: 2.4 * speedMult, tipo: "avispa" }
        ],
        metaPolen: 10,
        mission: { type: "rescate", target: 3 }
      };
    case 8:
      return {
        title: "Nivel 8: Salvar las Fuentes 💧",
        info: "Activen las 3 fuentes de agua y mantengan el control del vuelo.",
        tipoFondo: "bosque",
        wind: { x: 0.25, y: -0.15 },
        items: Array.from({length: 8}, () => getRandomPoint()),
        enemies: [
          { x: 220, y: 70, w: 45, h: 45, sx: 1.8 * speedMult, sy: 2.5 * speedMult, tipo: "aspersor" },
          { x: 570, y: 290, w: 50, h: 50, sx: -2.2 * speedMult, sy: -2.4 * speedMult, tipo: "avispa" }
        ],
        metaPolen: 8,
        mission: { type: "fuentes", target: 3 }
      };
    case 9:
      return {
        title: "Nivel 9: Transporte de Polen 🏠",
        info: "Recolecten 12 de polen y regresen juntos a la colmena.",
        tipoFondo: "cultivo",
        wind: { x: -0.35, y: -0.1 },
        items: Array.from({length: 12}, () => getRandomPoint()),
        enemies: [
          { x: 200, y: 80, w: 45, h: 45, sx: 2.3 * speedMult, sy: 3 * speedMult, tipo: "pesticida" },
          { x: 470, y: 210, w: 50, h: 50, sx: -2.6 * speedMult, sy: -2.8 * speedMult, tipo: "avispa" },
          { x: 650, y: 100, w: 45, h: 45, sx: 0, sy: 3.2 * speedMult, tipo: "aspersor" }
        ],
        metaPolen: 12,
        mission: { type: "regreso", target: 12 }
      };
    case 10:
      return {
        title: "Nivel 10: El Gran Santuario 👑",
        info: "Misión final: recolecten 14 de polen, activen 3 santuarios y regresen a la colmena.",
        tipoFondo: "bosque",
        wind: { x: 0.45, y: -0.35 },
        items: Array.from({length: 14}, () => getRandomPoint()),
        enemies: [
          { x: 220, y: 70, w: 50, h: 50, sx: 2.6 * speedMult, sy: 3.2 * speedMult, tipo: "avispa" },
          { x: 500, y: 210, w: 45, h: 45, sx: -2.7 * speedMult, sy: -3 * speedMult, tipo: "pesticida" },
          { x: 650, y: 100, w: 45, h: 45, sx: 0, sy: 3.4 * speedMult, tipo: "aspersor" }
        ],
        metaPolen: 14,
        mission: { type: "santuario", target: 3 }
      };
  }
}

let activeData;

function initGame() {
  changeLevel(1);
  const hs = document.getElementById('highscore-display');
  if (hs) hs.innerText = '🏆 Récord de Polen: ' + highscore;
  gameLoop();
}

function update() {
  if (!juegoIniciado || juegoPausado || gameOver) return;
  actualizarEfectos();

  // Movimiento Jugador 1 (Flechas del teclado)
  if (keys['ArrowUp']) bee.y -= bee.speed;
  if (keys['ArrowDown']) bee.y += bee.speed;
  if (keys['ArrowLeft']) bee.x -= bee.speed;
  if (keys['ArrowRight']) bee.x += bee.speed;

  // Movimiento Jugador 2 (solo en cooperativo)
  if (modoJuego === 2) {
    if (keys['w']) bee2.y -= bee2.speed;
    if (keys['s']) bee2.y += bee2.speed;
    if (keys['a']) bee2.x -= bee2.speed;
    if (keys['d']) bee2.x += bee2.speed;
  }

  // Aplicar viento del nivel a ambas abejas.
  // Se conserva exactamente la intensidad definida en cada nivel;
  // solo se limita el efecto a jugadores activos para no alterar la lógica.
  if (activeData.wind) {
    bee.x += activeData.wind.x;
    bee.y += activeData.wind.y;
    if (modoJuego === 2) {
      bee2.x += activeData.wind.x;
      bee2.y += activeData.wind.y;
    }
  }

  // Límites de pantalla para ambas
  bee.x = Math.max(0, Math.min(canvas.width - bee.w, bee.x));
  bee.y = Math.max(0, Math.min(canvas.height - bee.h, bee.y));
  bee2.x = Math.max(0, Math.min(canvas.width - bee2.w, bee2.x));
  bee2.y = Math.max(0, Math.min(canvas.height - bee2.h, bee2.y));

  if (bee.invulnerableTimer > 0) bee.invulnerableTimer--;
  if (bee2.invulnerableTimer > 0) bee2.invulnerableTimer--;

  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.gravity) p.vy += p.gravity;
    p.alpha -= p.sparkle ? 0.035 : 0.03;
  });
  particles = particles.filter(p => p.alpha > 0);
  collectionRings.forEach(r => { r.radius += r.speed; r.alpha -= 0.045; });
  collectionRings = collectionRings.filter(r => r.alpha > 0);
  impactRings.forEach(r => { r.radius += r.speed; r.alpha -= 0.065; });
  impactRings = impactRings.filter(r => r.alpha > 0);

  const cx1 = bee.x + bee.w / 2;
  const cy1 = bee.y + bee.h / 2;
  const cx2 = bee2.x + bee2.w / 2;
  const cy2 = bee2.y + bee2.h / 2;

  // Recolectar polen (Cualquiera de las dos abejas puede sumar puntos)
  activeData.items.forEach(it => {
    if (it.active) {
      if (Math.hypot(cx1 - it.x, cy1 - it.y) < 25) {
        it.active = false; bee.pollenCount++; createParticles(it.x, it.y, '#f39c12');
        crearEfectoRecoleccionPolen(it.x, it.y, '#f7b733');
      } else if (modoJuego === 2 && Math.hypot(cx2 - it.x, cy2 - it.y) < 25) {
        it.active = false; bee2.pollenCount++; createParticles(it.x, it.y, '#e67e22');
        crearEfectoRecoleccionPolen(it.x, it.y, '#f7b733');
      }
    }
  });

  moveEnemies(activeData.enemies);

  // Power-up: recoger escudo o polen dorado
  if (activeData.powerUps) {
    const cx1 = bee.x + bee.w / 2;
    const cy1 = bee.y + bee.h / 2;
    const cx2 = bee2.x + bee2.w / 2;
    const cy2 = bee2.y + bee2.h / 2;
    activeData.powerUps.forEach(pu => {
      if (!pu.active) return;
      const cercaP1 = Math.hypot(cx1 - pu.x, cy1 - pu.y) < 30;
      const cercaP2 = modoJuego === 2 && Math.hypot(cx2 - pu.x, cy2 - pu.y) < 30;
      if (cercaP1 || cercaP2) {
        pu.active = false;
        if (pu.type === 'escudo') {
          bee.invulnerableTimer = 300;
          if (modoJuego === 2) bee2.invulnerableTimer = 300;
          addFloatingText('🛡️ ¡ESCUDO ACTIVO!', canvas.width / 2, 100, '#3498db');
          reproducirSonido('victoria');
        } else {
          totalPolenAcumuladoPartida += 5;
          crearEfectoRecoleccionPolen(pu.x, pu.y, '#ffd700', true);
          if (cercaP2 && !cercaP1) bee2.pollenCount += 5;
          else bee.pollenCount += 5;
          addFloatingText('⭐ ¡+5 POLEN DORADO!', canvas.width / 2, 100, '#f1c40f');
          reproducirSonido('victoria');
        }
      }
    });
  }

  // Validación de nivel superado.
  // Niveles 1-6: se conserva exactamente la regla original (recoger todo).
  // Niveles 7-9: se añaden objetivos de misión sin alterar la recolección.
  if (currentLevel <= 6) {
    let itemsRestantes = activeData.items.filter(it => it.active).length;
    if (activeData.items.length > 0 && itemsRestantes === 0) {
      avanzarNivel();
    }
  } else {
    actualizarMision();
  }
}


function actualizarMision() {
  if (!activeData.mission || missionState.completed) return;

  const cx1 = bee.x + bee.w / 2, cy1 = bee.y + bee.h / 2;
  const cx2 = bee2.x + bee2.w / 2, cy2 = bee2.y + bee2.h / 2;
  const activos = modoJuego === 2 ? [{x:cx1,y:cy1}, {x:cx2,y:cy2}] : [{x:cx1,y:cy1}];

  if (missionState.type === "rescate") {
    missionState.zones.forEach(z => {
      if (!z.active) return;
      if (activos.some(p => Math.hypot(p.x-z.x, p.y-z.y) < 38)) {
        z.active = false;
        missionState.progress++;
        createParticles(z.x, z.y, '#2ecc71');
        addFloatingText("🌱 ZONA RESCATADA", z.x, z.y, '#2ecc71');
      }
    });
    const polenOk = activeData.items.every(it => !it.active);
    if (polenOk && missionState.progress >= missionState.target) completarMision();
  }

  if (missionState.type === "fuentes") {
    missionState.zones.forEach(z => {
      if (!z.active) return;
      if (activos.some(p => Math.hypot(p.x-z.x, p.y-z.y) < 38)) {
        z.active = false;
        missionState.progress++;
        createParticles(z.x, z.y, '#3498db');
        addFloatingText("💧 ¡FUENTE ACTIVADA!", z.x, z.y, '#3498db');
      }
    });
    if (missionState.progress >= missionState.target) completarMision();
  }

  if (missionState.type === "santuario") {
    missionState.zones.forEach(z => {
      if (!z.active) return;
      if (activos.some(p => Math.hypot(p.x-z.x, p.y-z.y) < 40)) {
        z.active = false;
        missionState.progress++;
        createParticles(z.x, z.y, '#f1c40f');
        addFloatingText("👑 ¡SANTUARIO ACTIVADO!", z.x, z.y, '#f1c40f');
      }
    });
    const polenOk = activeData.items.every(it => !it.active);
    if (polenOk && missionState.progress >= missionState.target) {
      missionState.home.unlocked = true;
      const todosEnCasa = activos.every(p => Math.hypot(p.x-missionState.home.x, p.y-missionState.home.y) < 60);
      if (todosEnCasa) completarMision();
    }
  }

  if (missionState.type === "regreso") {
    const polenOk = activeData.items.every(it => !it.active);
    if (polenOk) {
      missionState.home.unlocked = true;
      const todosEnCasa = activos.every(p =>
        Math.hypot(p.x-missionState.home.x, p.y-missionState.home.y) < 55
      );
      // En cooperativo ambos deben regresar; en individual basta P1.
      if (todosEnCasa) completarMision();
    }
  }
}

function completarMision() {
  if (missionState.completed) return;
  missionState.completed = true;
  addFloatingText("🌟 ¡MISIÓN COMPLETADA!", canvas.width/2, 90, '#f1c40f');
  reproducirSonido('victoria');
  setTimeout(() => {
    if (!gameOver) avanzarNivel();
  }, 700);
}

function prepararMision(config) {
  missionState = {
    type: config.mission ? config.mission.type : null,
    progress: 0,
    target: config.mission ? config.mission.target : 0,
    completed: false,
    zones: [],
    home: null
  };

  if (missionState.type === "rescate") {
    missionState.zones = [
      { x: 180, y: 120, active: true, label: "A" },
      { x: 420, y: 310, active: true, label: "B" },
      { x: 670, y: 130, active: true, label: "C" }
    ];
  } else if (missionState.type === "fuentes") {
    missionState.zones = [
      { x: 170, y: 320, active: true, label: "1" },
      { x: 400, y: 110, active: true, label: "2" },
      { x: 680, y: 320, active: true, label: "3" }
    ];
  } else if (missionState.type === "regreso") {
    missionState.home = { x: 70, y: 225, unlocked: false };
  } else if (missionState.type === "santuario") {
    missionState.zones = [
      { x: 180, y: 110, active: true, label: "I" },
      { x: 430, y: 300, active: true, label: "II" },
      { x: 680, y: 120, active: true, label: "III" }
    ];
    missionState.home = { x: 70, y: 225, unlocked: false };
  }
}

function textoMision() {
  if (!activeData || !activeData.mission) return "";
  if (missionState.type === "rescate") {
    return `Rescate: ${missionState.progress}/${missionState.target} zonas`;
  }
  if (missionState.type === "fuentes") {
    return `Fuentes: ${missionState.progress}/${missionState.target}`;
  }
  if (missionState.type === "regreso") {
    return missionState.home && missionState.home.unlocked
      ? "¡Polen completo! Regresen a la colmena"
      : "Recolecten todo el polen";
  }
  if (missionState.type === "santuario") {
    if (missionState.home && missionState.home.unlocked) return "¡Santuario restaurado! Regresen a la colmena";
    return `Santuario: ${missionState.progress}/${missionState.target}`;
  }
  return "";
}

function avanzarNivel() {
  if (currentLevel < maxLevels) {
    currentLevel++;
    bee.speed = bee.baseSpeed + (currentLevel - 1) * 0.25;
    bee2.speed = bee.speed;
    changeLevel(currentLevel);
  } else {
    gameOver = true;
    actualizarRecord();
    reproducirSonido('victoria');
    phaseTitle.innerText = modoJuego === 2 ? "¡VICTORIA COOPERATIVA! 🐝🏆" : "¡VICTORIA! 🐝🏆";
    infoUI.innerText = "¡Han completado los 10 niveles y restaurado el Gran Santuario!";
  }
}

function siguienteNivelDebug() {
  if (!gameOver) avanzarNivel();
}

function reiniciarJuegoCompleto() {
  gameOver = false;
  currentLevel = 1;
  bee.lives = 3;
  bee.pollenCount = 0;
  bee2.pollenCount = 0;
  bee.invulnerableTimer = 0;
  bee2.invulnerableTimer = 0;
  totalPolenAcumuladoPartida = 0;
  screenShakeTimer = 0;
  floatingTexts = [];
  collectionRings = [];
  impactRings = [];
  particles = [];
  bee.speed = bee.baseSpeed;
  bee2.speed = bee.baseSpeed;
  changeLevel(1);
}

function moveEnemies(enemies) {
  enemies.forEach(e => {
    // Movimiento base conservado. Solo añadimos una oscilación visual suave
    // para que cada enemigo se sienta más vivo sin alterar su trayectoria principal.
    if (e.phase == null) e.phase = Math.random() * Math.PI * 2;
    e.phase += 0.045;
    e.y += e.sy;
    if (e.sx) e.x += e.sx;

    if (e.y < 20 || e.y > canvas.height - e.h - 20) e.sy *= -1;
    if (e.x < 150 || e.x > canvas.width - e.w - 20) e.sx *= -1;

    // Colisión con Jugador 1.
    // Hitbox ligeramente más justa que el dibujo para evitar golpes injustos en bordes.
    const margen = 5;
    if (bee.x + margen < e.x + e.w && bee.x + bee.w - margen > e.x && bee.y + margen < e.y + e.h && bee.y + bee.h - margen > e.y) {
      if (bee.invulnerableTimer <= 0) {
        bee.lives--;
        bee.invulnerableTimer = 60;
        screenShakeTimer = 20;
        // V1.5: destello rojo de daño y estallido sobre el enemigo; el enemigo permanece activo.
        crearEfectoImpacto(bee.x + bee.w / 2, bee.y + bee.h / 2, 'daño');
        crearEfectoImpacto(e.x + e.w / 2, e.y + e.h / 2, 'impacto');
        bee.x = 60; bee.y = 200;
        reproducirSonido('daño');
        addFloatingText('❌ ¡DAÑO!', bee.x, bee.y, '#e74c3c');
        if (bee.lives <= 0) triggerGameOver(false);
      }
    }

    // Colisión con Jugador 2 en modo cooperativo
    if (modoJuego === 2 && bee2.x + margen < e.x + e.w && bee2.x + bee2.w - margen > e.x && bee2.y + margen < e.y + e.h && bee2.y + bee2.h - margen > e.y) {
      if (bee2.invulnerableTimer <= 0) {
        bee2.invulnerableTimer = 60;
        bee.lives--;
        screenShakeTimer = 20;
        // V1.5: efecto visual equivalente para P2, sin cambiar sus reglas.
        crearEfectoImpacto(bee2.x + bee2.w / 2, bee2.y + bee2.h / 2, 'daño');
        crearEfectoImpacto(e.x + e.w / 2, e.y + e.h / 2, 'impacto');
        bee2.x = 60; bee2.y = 260;
        reproducirSonido('daño');
        addFloatingText('❌ ¡DAÑO P2!', bee2.x, bee2.y, '#e67e22');
        if (bee.lives <= 0) triggerGameOver(false);
      }
    }
  });
}

function changeLevel(lvl) {
  currentLevel = lvl;
  activeData = getLevelConfig(currentLevel);
  activeData.powerUps = [{
    x: Math.random() * 500 + 200,
    y: Math.random() * 250 + 100,
    type: Math.random() > 0.5 ? 'escudo' : 'dorado',
    active: true, w: 35, h: 35
  }];
  bee.x = 60; bee.y = 200;
  bee2.x = 60; bee2.y = 260;
  bee.pollenCount = 0;
  bee2.pollenCount = 0;
  prepararMision(activeData);
  phaseTitle.innerText = activeData.title;
  infoUI.innerText = activeData.info;
}

// --- 3. DIBUJADO VECTORIAL ILUSTRATIVO ---
let tiempoAmbiental = 0;

function render() {
  // CAM-VISUAL-02: animación ambiental. Solo afecta el renderizado; no modifica la lógica del juego.
  if (juegoIniciado && !juegoPausado) tiempoAmbiental += 0.016;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  if (screenShakeTimer > 0 && juegoIniciado && !gameOver) {
    ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
  }

  dibujarFondoTematico(activeData.tipoFondo);

  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = bee.lives <= 0 ? "#e74c3c" : "#f1c40f"; 
    ctx.font = "bold 36px Arial"; ctx.textAlign = "center";
    ctx.fillText(bee.lives <= 0 ? "¡GAME OVER!" : "¡MISIÓN CUMPLIDA EN EQUIPO!", canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = "18px Arial"; 
    ctx.fillText(bee.lives <= 0 ? `Se quedaron sin vidas en el Nivel ${currentLevel}` : "¡Excelente trabajo cooperativo!", canvas.width / 2, canvas.height / 2 + 20);
    ctx.fillStyle = "#f1c40f"; ctx.fillText("Presiona ESPACIO para volver a jugar", canvas.width / 2, canvas.height / 2 + 60);
    ctx.textAlign = 'left';
    ctx.restore();
    return;
  }

  // Dibujar flores / polen
  activeData.items.filter(it => it.active).forEach(it => {
    dibujarFlor(it.x, it.y);
  });

  // Dibujar objetivos de las misiones 7-9.
  dibujarObjetivosMision();

  // Dibujar enemigos
  if (activeData.enemies) {
    activeData.enemies.forEach(e => {
      if (e.tipo === "aspersor") dibujarAspersor(e.x, e.y, e.w, e.h);
      else if (e.tipo === "pesticida") dibujarPesticida(e.x, e.y, e.w, e.h);
      else if (e.tipo === "avispa") dibujarAvispa(e.x, e.y, e.w, e.h);
    });
  }

  // CAM-VISUAL-07: anillos luminosos que se expanden al recoger polen.
  collectionRings.forEach(r => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, r.alpha);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.lineWidth;
    ctx.shadowColor = r.color;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });

  // CAM-VISUAL-08: anillos de choque/estallido sobre el escenario.
  impactRings.forEach(r => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, r.alpha);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.lineWidth;
    ctx.shadowColor = r.color;
    ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });

  // Partículas y chispas de recolección e impacto.
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    if (p.impact) {
      // Fragmentos angulares para que el choque se lea como un pequeño estallido.
      ctx.translate(p.x, p.y);
      p.angle = (p.angle || 0) + (p.spin || 0);
      ctx.rotate(p.angle);
      ctx.beginPath();
      ctx.moveTo(0, -p.size * 1.7);
      ctx.lineTo(p.size * 0.55, -p.size * 0.15);
      ctx.lineTo(p.size * 0.2, p.size * 1.25);
      ctx.lineTo(-p.size * 0.45, p.size * 0.25);
      ctx.closePath(); ctx.fill();
    } else if (p.sparkle) {
      // Pequeña chispa de cuatro puntas para dar sensación de polen brillante.
      ctx.translate(p.x, p.y);
      ctx.rotate((1 - p.alpha) * 2.5);
      ctx.beginPath();
      ctx.moveTo(0, -p.size * 1.8); ctx.lineTo(p.size * 0.45, 0);
      ctx.lineTo(0, p.size * 1.8); ctx.lineTo(-p.size * 0.45, 0);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });

  // Dibujar Power-Ups
  if (activeData.powerUps) {
    activeData.powerUps.forEach(pu => {
      if (!pu.active) return;
      ctx.save();
      ctx.translate(pu.x, pu.y);
      ctx.fillStyle = pu.type === 'escudo' ? '#3498db' : '#f1c40f';
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
      ctx.fillText(pu.type === 'escudo' ? '🛡️' : '⭐', 0, 5);
      ctx.restore();
    });
  }

  // Dibujar textos flotantes
  floatingTexts.forEach(ft => {
    ctx.save(); ctx.globalAlpha = ft.alpha; ctx.fillStyle = ft.color;
    ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y); ctx.restore();
  });

  // Dibujar Abeja 1 (Amarilla - Control con Flechas)
  if (bee.invulnerableTimer % 10 < 5) {
    dibujarAbejaVectorial(bee.x, bee.y, bee.w, bee.h, bee.color, bee.invulnerableTimer > 0);
  }

  // Dibujar Abeja 2 (Naranja - Control con W, A, S, D)
  if (modoJuego === 2 && bee2.invulnerableTimer % 10 < 5) {
    dibujarAbejaVectorial(bee2.x, bee2.y, bee2.w, bee2.h, bee2.color, bee2.invulnerableTimer > 0);
  }

  drawHUD();
  ctx.restore();
}

// --- FUNCIONES DE DIBUJO ---
function dibujarFondoTematico(tipo) {
  // CAM-VISUAL-05: escenario natural enriquecido.
  // Cambio exclusivamente visual: no modifica posiciones, colisiones, controles,
  // enemigos, misiones, puntuación ni progresión de niveles.
  const nivel = currentLevel || 1;
  const cielo = ctx.createLinearGradient(0, 0, 0, canvas.height);

  if (nivel === 1) {
    // Jardín natural: colinas suaves, árboles y pradera luminosa.
    cielo.addColorStop(0, '#62bce8'); cielo.addColorStop(0.58, '#b9e9f5'); cielo.addColorStop(1, '#e4f4c4');
    ctx.fillStyle = cielo; ctx.fillRect(0, 0, canvas.width, canvas.height);
    dibujarSol(690, 68, 35, '#ffe18a'); dibujarNubes(110, 62, 0.82); dibujarNubes(440, 94, 0.68);
    dibujarMontanas('#9bc6a0', '#76b879');
    dibujarArbol(55, 255, 1.0); dibujarArbol(155, 286, 0.72); dibujarArbol(655, 265, 0.94); dibujarArbol(755, 285, 0.76);
    dibujarJardin(0, 350, '#72bf63'); dibujarFloresDecorativas(26);
  } else if (nivel === 2 || nivel === 5 || nivel === 9) {
    // Prado abierto con colinas, campo y vegetación.
    cielo.addColorStop(0, nivel === 5 ? '#f7b96a' : '#78c9ed'); cielo.addColorStop(0.62, nivel === 5 ? '#f8dfad' : '#d7f0ed'); cielo.addColorStop(1, '#c4e5a2');
    ctx.fillStyle = cielo; ctx.fillRect(0, 0, canvas.width, canvas.height);
    dibujarSol(705, 65, 39, nivel === 5 ? '#ffca74' : '#ffe58a'); dibujarNubes(135, 70, 0.68);
    dibujarMontanas('#9bbdb1', '#6eaa78'); dibujarCampoSurcos(); dibujarFloresDecorativas(18);
    if (nivel === 5) dibujarNieblaContaminacion();
  } else if (nivel === 3 || nivel === 6 || nivel === 8 || nivel === 10) {
    // Bosque/santuario con profundidad, luz filtrada y suelo frondoso.
    cielo.addColorStop(0, nivel >= 8 ? '#68c99b' : '#6fbfcb'); cielo.addColorStop(0.52, '#bfe9c1'); cielo.addColorStop(1, '#7fb879');
    ctx.fillStyle = cielo; ctx.fillRect(0, 0, canvas.width, canvas.height);
    dibujarRayosBosque(); dibujarSol(115, 65, 31, '#ffe58e'); dibujarNubes(430, 55, 0.58);
    dibujarBosqueLejano(); dibujarArbol(55, 245, 1.16); dibujarArbol(175, 275, 0.84); dibujarArbol(625, 250, 1.08); dibujarArbol(735, 285, 0.82);
    dibujarPastoBosque();
    // V2.0: pequeños detalles del suelo del bosque. Son decorativos y no tienen colisión.
    dibujarDetallesBosque();
    dibujarFloresDecorativas(15);
    if (nivel === 6 || nivel === 10) dibujarSantuarioDecorativo(nivel);
  } else if (nivel === 4 || nivel === 7) {
    // Pradera de flores con colinas suaves y colores cálidos.
    cielo.addColorStop(0, '#78c9ef'); cielo.addColorStop(0.58, '#d9f3f2'); cielo.addColorStop(1, '#d1edb0');
    ctx.fillStyle = cielo; ctx.fillRect(0, 0, canvas.width, canvas.height);
    dibujarSol(700, 68, 38, '#ffe58a'); dibujarNubes(125, 70, 0.74); dibujarNubes(470, 80, 0.52);
    dibujarColinas('#a4d68a', '#78c66d'); dibujarJardin(0, 350, '#69bd5d');
    dibujarFloresDecorativas(nivel === 7 ? 32 : 38);
    if (nivel === 7) dibujarZonasRescateDecorativas();
  } else {
    cielo.addColorStop(0, '#83d0ed'); cielo.addColorStop(1, '#ccebb1'); ctx.fillStyle = cielo; ctx.fillRect(0, 0, canvas.width, canvas.height);
    dibujarSol(690, 70, 36, '#ffe58a'); dibujarMontanas('#a0c8a1', '#78b879'); dibujarJardin(0, 350, '#72bf63'); dibujarFloresDecorativas(24);
  }

  // CAM-VISUAL-09 / V1.7: arbustos en planos de profundidad, siempre detrás del juego.
  // Se dibujan tras el terreno base y antes de los objetos jugables; no tienen colisión.
  dibujarVegetacionProfundidad(nivel);

  // V2.6: planos atmosféricos y encuadre vegetal sutil; solo decoración de fondo.
  // Se mantiene detrás de flores, enemigos y abejas, sin colisiones ni cambios de lógica.
  dibujarProfundidadAtmosferica(nivel);

  // V2.1: agua ambiental decorativa. No crea hitboxes ni modifica mecánicas.
  dibujarAguaAmbiental(nivel);

  // V2.2: mariposas y libélulas ambientales. Solo se dibujan; no son entidades jugables.
  dibujarFaunaDecorativa(nivel);

  // V1.8: iluminación ambiental decorativa. No afecta a las mecánicas ni a las colisiones.
  dibujarIluminacionAmbiental(nivel);

  // V1.6: detalles ambientales exclusivamente visuales, detrás de los objetos jugables.
  // No cambian colisiones, posiciones, controles, puntuación ni progresión.
  dibujarDetallesAmbientales(nivel);

  // Viñeta sutil que aporta profundidad sin tapar los elementos de juego.
  const sombra = ctx.createRadialGradient(400, 220, 120, 400, 220, 520);
  sombra.addColorStop(0, 'rgba(255,255,255,0)'); sombra.addColorStop(1, 'rgba(28,72,44,0.14)');
  ctx.fillStyle = sombra; ctx.fillRect(0, 0, canvas.width, canvas.height);

  // V2.5.1: dibujar las luciérnagas al final para que la nueva iluminación no oculte sus destellos.
  // Siguen siendo decoración ambiental sin colisión ni interacción.
  dibujarLuciernagasAmbientales(nivel);
}
// V1.7: vegetación decorativa en capas para reforzar la profundidad del escenario.
function dibujarVegetacionProfundidad(nivel) {
  ctx.save();
  const bosque = [3, 6, 8, 10].includes(nivel);
  // Arbustos del plano medio: siluetas suaves y espaciadas.
  const arbustos = bosque
    ? [[35,337,31],[126,345,25],[265,334,29],[418,342,34],[590,336,28],[744,344,32]]
    : [[18,344,24],[180,348,19],[355,341,27],[540,347,22],[770,342,26]];
  arbustos.forEach(([x,y,r], i) => {
    ctx.fillStyle = bosque
      ? (i%2 ? 'rgba(45, 112, 67, 0.28)' : 'rgba(64, 137, 76, 0.30)')
      : (i%2 ? 'rgba(89, 164, 82, 0.23)' : 'rgba(116, 185, 91, 0.25)');
    ctx.beginPath();
    ctx.ellipse(x, y, r, r*0.48, 0, Math.PI, Math.PI*2);
    ctx.ellipse(x+r*0.48, y+1, r*0.62, r*0.42, 0, Math.PI, Math.PI*2);
    ctx.fill();
  });
  // Pequeños grupos de hojas en el borde inferior, discretos para no distraer.
  for (let i=0; i<16; i++) {
    const x=(i*59+13)%canvas.width;
    const y=425+(i%3)*7;
    const balanceo=Math.sin(tiempoAmbiental*1.25+i)*1.2;
    ctx.save(); ctx.translate(x,y); ctx.rotate(balanceo*0.035);
    ctx.fillStyle = bosque ? 'rgba(27, 91, 54, 0.26)' : 'rgba(46, 124, 56, 0.22)';
    ctx.beginPath(); ctx.ellipse(-4,0,7,2.5,-0.38,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4,2,6,2.2,0.38,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// V2.6: capas atmosféricas para aumentar la separación entre fondo lejano, plano medio y primer plano.
// Todo es visual: no crea entidades, hitboxes ni modifica controles o progresión.
function dibujarProfundidadAtmosferica(nivel) {
  ctx.save();
  const bosque = [3, 6, 8, 10].includes(nivel);
  const atardecer = nivel === 5;

  // Bruma horizontal muy tenue: baja el contraste del paisaje lejano y separa los planos.
  const bruma = ctx.createLinearGradient(0, 185, 0, 365);
  bruma.addColorStop(0, bosque ? 'rgba(221, 244, 210, 0)' : 'rgba(235, 248, 220, 0)');
  bruma.addColorStop(0.48, bosque ? 'rgba(214, 239, 205, 0.105)' : 'rgba(224, 241, 211, 0.065)');
  bruma.addColorStop(1, 'rgba(224, 241, 211, 0)');
  ctx.fillStyle = bruma;
  ctx.fillRect(0, 185, canvas.width, 180);

  // Siluetas lejanas con contraste reducido; enmarcan el horizonte sin competir con el juego.
  if (bosque) {
    ctx.fillStyle = 'rgba(48, 111, 75, 0.16)';
    const copasLejanas = [
      [18, 278, 38], [92, 265, 30], [168, 283, 34], [260, 270, 29],
      [356, 280, 36], [455, 266, 31], [548, 281, 35], [644, 268, 32], [758, 278, 40]
    ];
    copasLejanas.forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI, Math.PI * 2);
      ctx.lineTo(x + r, y + 9);
      ctx.lineTo(x - r, y + 9);
      ctx.closePath();
      ctx.fill();
    });
    // Un reborde de luz tenue ayuda a separar las copas lejanas del plano medio.
    ctx.strokeStyle = 'rgba(198, 231, 163, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 290); ctx.quadraticCurveTo(190, 270, 365, 291);
    ctx.quadraticCurveTo(570, 267, 800, 288); ctx.stroke();
  } else {
    // Horizonte suave en praderas y campos, sin alterar las formas del terreno original.
    const horizonte = ctx.createLinearGradient(0, 265, 0, 335);
    horizonte.addColorStop(0, atardecer ? 'rgba(255, 215, 157, 0)' : 'rgba(235, 248, 220, 0)');
    horizonte.addColorStop(0.55, atardecer ? 'rgba(255, 220, 168, 0.10)' : 'rgba(237, 247, 217, 0.08)');
    horizonte.addColorStop(1, 'rgba(237, 247, 217, 0)');
    ctx.fillStyle = horizonte;
    ctx.fillRect(0, 265, canvas.width, 70);
  }

  // Primer plano orgánico en las esquinas inferiores: aporta encuadre sin tapar la zona central.
  const tonoHoja = bosque ? 'rgba(24, 83, 48, 0.23)' : 'rgba(44, 119, 52, 0.17)';
  [[-8, 431, -0.45], [18, 442, 0.32], [785, 438, -0.3], [808, 429, 0.48]].forEach(([x, y, rot]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = tonoHoja;
    ctx.beginPath(); ctx.ellipse(0, 0, 25, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8, -9, 19, 6, -0.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(190, 224, 132, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-15, 2); ctx.quadraticCurveTo(0, 0, 20, -1); ctx.stroke();
    ctx.restore();
  });

  ctx.restore();
}

// --- Elementos puramente visuales del escenario ---
function dibujarRayosBosque() {
  // Rayos translúcidos de luz entre las copas; solo decorativos.
  ctx.save();
  const luz=ctx.createLinearGradient(110,0,370,330); luz.addColorStop(0,'rgba(255,239,156,0.18)'); luz.addColorStop(1,'rgba(255,239,156,0)');
  ctx.fillStyle=luz;
  ctx.beginPath(); ctx.moveTo(80,0); ctx.lineTo(145,0); ctx.lineTo(310,335); ctx.lineTo(220,335); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(210,0); ctx.lineTo(250,0); ctx.lineTo(405,300); ctx.lineTo(350,300); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function dibujarSol(x, y, r, color) {
  ctx.save(); ctx.fillStyle = 'rgba(255,220,120,0.18)'; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function dibujarNubes(x, y, escala) {
  ctx.save();
  // CAM-VISUAL-02: movimiento suave de nubes, puramente decorativo.
  const desplazamiento = Math.sin(tiempoAmbiental * 0.18 + x * 0.01) * 12;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  [[0,0,24],[28,-5,30],[58,2,22],[35,10,28]].forEach(([dx,dy,r]) => { ctx.beginPath(); ctx.arc(x+dx*escala+desplazamiento, y+dy*escala, r*escala, 0, Math.PI*2); ctx.fill(); });
  ctx.restore();
}

function dibujarEdificio(x, y, w, h, color) {
  ctx.save(); ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,236,170,0.75)';
  for (let yy = y + 18; yy < y + h - 12; yy += 30) for (let xx = x + 14; xx < x + w - 10; xx += 27) ctx.fillRect(xx, yy, 10, 14);
  ctx.restore();
}

function dibujarJardin(x, y, color) {
  // Pradera con capas de hierba; decoración dibujada detrás de los elementos jugables.
  const gradiente = ctx.createLinearGradient(0, y, 0, canvas.height);
  gradiente.addColorStop(0, color); gradiente.addColorStop(1, '#397d45');
  ctx.fillStyle = gradiente; ctx.fillRect(x, y, canvas.width, canvas.height-y);
  ctx.lineWidth = 2;
  for (let i=0; i<canvas.width+20; i+=24) {
    const balanceo = Math.sin(tiempoAmbiental*1.8+i*0.08)*3;
    ctx.strokeStyle = i%3===0 ? 'rgba(222,246,164,0.48)' : 'rgba(32,104,53,0.28)';
    ctx.beginPath(); ctx.moveTo(i,y+30+(i%4)*5); ctx.quadraticCurveTo(i+5+balanceo,y+12,i+10,y+23); ctx.stroke();
  }
  for (let i=0; i<20; i++) {
    const hx=(i*47+13)%canvas.width, hy=y+55+(i%3)*10;
    ctx.fillStyle=i%2 ? 'rgba(194,229,112,0.55)' : 'rgba(38,112,55,0.42)';
    ctx.beginPath(); ctx.ellipse(hx,hy,5,2.2,Math.sin(i)*0.4,0,Math.PI*2); ctx.fill();
  }
}

function dibujarMontanas(c1, c2) {
  // V2.9: relieve del paisaje con facetas suaves, laderas y sombras ambientales.
  // Solo modifica el dibujo decorativo del fondo; no afecta colisiones ni lógica.
  ctx.save();
  // Plano lejano: siluetas redondeadas visualmente por facetas de luz.
  ctx.fillStyle = 'rgba(177, 207, 197, 0.78)';
  ctx.beginPath();
  ctx.moveTo(0,276); ctx.lineTo(72,178); ctx.quadraticCurveTo(84,163,99,187);
  ctx.lineTo(145,226); ctx.lineTo(208,132); ctx.quadraticCurveTo(213,125,220,137);
  ctx.lineTo(286,225); ctx.lineTo(365,158); ctx.quadraticCurveTo(371,150,380,165);
  ctx.lineTo(438,221); ctx.lineTo(540,143); ctx.quadraticCurveTo(546,135,554,146);
  ctx.lineTo(620,218); ctx.lineTo(710,164); ctx.quadraticCurveTo(716,156,725,170);
  ctx.lineTo(800,245); ctx.lineTo(800,450); ctx.lineTo(0,450); ctx.closePath(); ctx.fill();
  // Caras iluminadas y caras en sombra, sin líneas geométricas duras.
  const facetas = [
    [[72,178],[99,187],[145,226],[111,218]],
    [[208,132],[220,137],[286,225],[247,194]],
    [[365,158],[380,165],[438,221],[405,203]],
    [[540,143],[554,146],[620,218],[581,195]],
    [[710,164],[725,170],[800,245],[757,219]]
  ];
  facetas.forEach((pts,i)=>{
    ctx.fillStyle = i%2 ? 'rgba(237,246,222,0.31)' : 'rgba(247,250,230,0.42)';
    ctx.beginPath(); pts.forEach((pt,j)=>j?ctx.lineTo(pt[0],pt[1]):ctx.moveTo(pt[0],pt[1])); ctx.closePath(); ctx.fill();
  });
  // Cumbres suaves con manchas de luz, no triángulos blancos planos.
  [[208,132,19],[540,143,20],[710,164,15]].forEach(([x,y,w])=>{
    ctx.fillStyle='rgba(245,250,231,0.46)'; ctx.beginPath();
    ctx.moveTo(x-w,y+24); ctx.quadraticCurveTo(x-w*0.55,y+10,x,y);
    ctx.quadraticCurveTo(x+w*0.45,y+11,x+w,y+25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,255,238,0.32)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(x-w*0.45,y+16); ctx.lineTo(x,y+3); ctx.stroke();
  });
  // Plano medio con laderas de color y pequeñas bandas de vegetación.
  ctx.fillStyle = c1;
  ctx.beginPath(); ctx.moveTo(0,300); ctx.quadraticCurveTo(50,244,110,190);
  ctx.quadraticCurveTo(165,244,220,300); ctx.lineTo(340,171);
  ctx.quadraticCurveTo(410,233,490,300); ctx.lineTo(610,196);
  ctx.quadraticCurveTo(699,253,800,305); ctx.lineTo(800,450); ctx.lineTo(0,450); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(224,239,177,0.18)';
  ctx.beginPath(); ctx.moveTo(110,190); ctx.quadraticCurveTo(152,236,181,270); ctx.quadraticCurveTo(143,249,124,245); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(340,171); ctx.quadraticCurveTo(382,223,423,265); ctx.quadraticCurveTo(377,235,359,226); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(47,119,72,0.10)';
  ctx.beginPath(); ctx.moveTo(220,300); ctx.quadraticCurveTo(278,246,340,171); ctx.quadraticCurveTo(318,249,290,300); ctx.closePath(); ctx.fill();
  // Plano cercano de colinas con bordes curvos y sombras de ladera.
  ctx.fillStyle = c2;
  ctx.beginPath(); ctx.moveTo(0,345); ctx.quadraticCurveTo(77,281,150,230);
  ctx.quadraticCurveTo(220,288,290,345); ctx.quadraticCurveTo(369,270,450,215);
  ctx.quadraticCurveTo(536,280,620,345); ctx.quadraticCurveTo(685,279,735,245);
  ctx.quadraticCurveTo(774,271,800,300); ctx.lineTo(800,450); ctx.lineTo(0,450); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(35,107,60,0.10)';
  ctx.beginPath(); ctx.moveTo(450,215); ctx.quadraticCurveTo(485,278,540,319); ctx.quadraticCurveTo(493,300,465,280); ctx.closePath(); ctx.fill();
  // Velo atmosférico para mantener la separación entre los planos.
  const bruma = ctx.createLinearGradient(0,235,0,345);
  bruma.addColorStop(0,'rgba(235,247,222,0.015)');
  bruma.addColorStop(0.55,'rgba(235,247,222,0.07)');
  bruma.addColorStop(1,'rgba(235,247,222,0.17)');
  ctx.fillStyle=bruma; ctx.fillRect(0,230,canvas.width,115);
  ctx.restore();
}

function dibujarCampoSurcos() {
  const campo=ctx.createLinearGradient(0,330,0,450); campo.addColorStop(0,'#a6d66d'); campo.addColorStop(1,'#5c9d4d');
  ctx.fillStyle=campo; ctx.fillRect(0,330,canvas.width,120);
  for (let x=-120; x<canvas.width+160; x+=42) {
    ctx.strokeStyle='rgba(79,116,52,0.32)'; ctx.lineWidth=9; ctx.beginPath(); ctx.moveTo(x,450); ctx.lineTo(x+85,330); ctx.stroke();
    ctx.strokeStyle='rgba(221,239,155,0.45)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x+5,450); ctx.lineTo(x+90,330); ctx.stroke();
  }
  for (let i=0; i<28; i++) {
    const x=(i*61+17)%790, y=350+(i%4)*24; ctx.strokeStyle='rgba(41,112,53,0.72)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x,y+8); ctx.lineTo(x-3,y); ctx.moveTo(x,y+8); ctx.lineTo(x+4,y+1); ctx.stroke();
  }
}

function dibujarNieblaContaminacion() {
  ctx.fillStyle = 'rgba(154,120,170,0.12)';
  for (let i=0;i<6;i++) { ctx.beginPath(); ctx.arc(80+i*145, 300+(i%2)*25, 65, 0, Math.PI*2); ctx.fill(); }
}

function dibujarBosqueLejano() {
  // CAM-VISUAL-09 / V1.7: montañas y varias líneas de árboles en el bosque.
  // La distancia se representa con tamaños pequeños y colores de baja opacidad.
  ctx.save();
  // Montañas muy lejanas, parcialmente veladas por la atmósfera del bosque.
  ctx.fillStyle = 'rgba(153, 193, 171, 0.43)';
  ctx.beginPath();
  ctx.moveTo(0, 280); ctx.lineTo(95, 172); ctx.lineTo(170, 242);
  ctx.lineTo(275, 145); ctx.lineTo(360, 235); ctx.lineTo(470, 160);
  ctx.lineTo(560, 239); ctx.lineTo(675, 150); ctx.lineTo(800, 268);
  ctx.lineTo(800, 390); ctx.lineTo(0, 390); ctx.closePath(); ctx.fill();
  // Línea de bosque más lejana: copas pequeñas y desaturadas.
  for (let i=0; i<25; i++) {
    const x=i*36-24, y=300+(i%4)*8, r=25+(i%3)*5;
    ctx.fillStyle=i%2 ? 'rgba(83, 145, 105, 0.30)' : 'rgba(105, 163, 117, 0.34)';
    ctx.beginPath(); ctx.arc(x,y,r,Math.PI,Math.PI*2); ctx.fill();
  }
  // Línea media: copas más grandes y oscuras para separar planos.
  for (let i=0; i<18; i++) {
    const x=i*50-20, y=310+(i%3)*12, r=38+(i%4)*5;
    ctx.fillStyle=i%2 ? 'rgba(38,105,67,0.42)' : 'rgba(61,133,79,0.44)';
    ctx.beginPath(); ctx.arc(x,y,r,Math.PI,Math.PI*2); ctx.fill();
    ctx.fillRect(x-4,y,8,48);
  }
  // Pequeños reflejos de luz en algunas copas; no interfieren con el juego.
  for (let i=0; i<12; i++) {
    const x=(i*71+19)%800, y=286+(i%4)*10;
    ctx.fillStyle='rgba(190, 224, 145, 0.20)';
    ctx.beginPath(); ctx.ellipse(x,y,9,3,-0.35,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function dibujarArbol(x, y, escala) {
  // V2.9: copas orgánicas, corteza con vetas y luz ambiental en los bordes.
  // Árboles decorativos únicamente: no se altera la física ni las colisiones.
  ctx.save(); ctx.translate(x,y); ctx.scale(escala,escala);
  // Sombra de contacto más suave bajo el árbol.
  const sombra=ctx.createRadialGradient(2,82,4,2,82,39);
  sombra.addColorStop(0,'rgba(24,69,37,0.25)'); sombra.addColorStop(1,'rgba(24,69,37,0)');
  ctx.fillStyle=sombra; ctx.beginPath(); ctx.ellipse(2,82,39,10,0,0,Math.PI*2); ctx.fill();
  // Tronco con variación tonal, estrechamiento y vetas de corteza.
  const tronco=ctx.createLinearGradient(-11,0,11,0);
  tronco.addColorStop(0,'#573b2b'); tronco.addColorStop(0.24,'#805638');
  tronco.addColorStop(0.52,'#aa7950'); tronco.addColorStop(0.76,'#805438'); tronco.addColorStop(1,'#4f3628');
  ctx.fillStyle=tronco; ctx.beginPath(); ctx.moveTo(-7,3); ctx.quadraticCurveTo(-5,34,-12,82);
  ctx.quadraticCurveTo(0,87,12,82); ctx.quadraticCurveTo(5,39,7,3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(220,166,105,0.48)'; ctx.lineWidth=1.5; ctx.lineCap='round';
  [[-3,16,-4,35], [2,42,0,61], [6,23,7,38], [-6,56,-8,70]].forEach(v=>{
    ctx.beginPath(); ctx.moveTo(v[0],v[1]); ctx.quadraticCurveTo(v[0]-1,v[1]+5,v[2],v[3]); ctx.stroke();
  });
  // Ramas con degradado y un pequeño borde de luz.
  ctx.strokeStyle='#67442f'; ctx.lineWidth=6; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(0,39); ctx.quadraticCurveTo(-11,27,-23,13); ctx.moveTo(2,31); ctx.quadraticCurveTo(12,18,24,7); ctx.stroke();
  ctx.strokeStyle='rgba(218,164,104,0.43)'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(-1,37); ctx.lineTo(-21,15); ctx.moveTo(3,30); ctx.lineTo(22,9); ctx.stroke();
  // Capas de follaje con gradientes radiales: volumen y variación de color.
  const hojas=[[-4,-37,43,'#2e7947'],[-31,-11,31,'#398d4e'],[28,-12,32,'#287644'],[0,-8,35,'#4b9b55'],[-15,-43,22,'#62ad5d'],[19,-38,23,'#58a653'],[-42,-29,17,'#347e49'],[40,-30,18,'#2b7040']];
  hojas.forEach(([hx,hy,r,color],i)=>{
    const g=ctx.createRadialGradient(hx-r*0.35,hy-r*0.42,2,hx,hy,r*1.18);
    g.addColorStop(0,i%2?'#79bf68':'#8acb70'); g.addColorStop(0.42,color); g.addColorStop(1,'#205d39');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(hx,hy,r,0,Math.PI*2); ctx.fill();
    // borde de luz tenue en la zona superior de cada copa
    ctx.strokeStyle='rgba(205,239,158,0.23)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.arc(hx,hy,r-1,Math.PI*1.08,Math.PI*1.82); ctx.stroke();
  });
  // Hojas pequeñas para romper la silueta circular.
  ctx.fillStyle='rgba(140,202,100,0.72)';
  [[-34,-45,4,2.5,-0.6],[13,-61,5,2.7,0.35],[34,-39,4,2.2,0.6],[-46,-20,3.8,2.1,-0.4],[3,-27,3,2,0.2]].forEach(([hx,hy,rx,ry,a])=>{
    ctx.beginPath(); ctx.ellipse(hx,hy,rx,ry,a,0,Math.PI*2); ctx.fill();
  });
  // Reflejos de luz moteada sobre las copas.
  ctx.fillStyle='rgba(235,255,184,0.34)';
  [[-19,-49,7],[8,-54,8],[28,-27,6],[-37,-19,5],[1,-36,4]].forEach(([hx,hy,r])=>{
    ctx.beginPath(); ctx.ellipse(hx,hy,r,r*0.72,-0.35,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

function dibujarPastoBosque() {
  const suelo=ctx.createLinearGradient(0,380,0,450); suelo.addColorStop(0,'#69a95d'); suelo.addColorStop(1,'#397b49');
  ctx.fillStyle=suelo; ctx.fillRect(0,380,canvas.width,70);
  for (let x=8; x<canvas.width; x+=22) {
    const h=5+(x%4)*2, balanceo=Math.sin(tiempoAmbiental*1.7+x*0.06)*2;
    ctx.strokeStyle=x%3 ? 'rgba(202,235,143,0.62)' : 'rgba(35,102,56,0.55)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(x,435+(x%3)*3); ctx.lineTo(x+balanceo,435-h); ctx.stroke();
  }
}

// V2.0: hongos, piedras, troncos y pequeñas plantas decorativas.
// Esta función solo dibuja el escenario; no crea hitboxes ni modifica la lógica del juego.
function dibujarDetallesBosque() {
  ctx.save();

  // Piedras bajas con volumen suave y reflejos discretos.
  const piedras = [
    { x: 82, y: 421, rx: 16, ry: 7, tono: '#718b73' },
    { x: 119, y: 430, rx: 9, ry: 4, tono: '#8ba08a' },
    { x: 476, y: 425, rx: 13, ry: 6, tono: '#647f69' },
    { x: 695, y: 427, rx: 18, ry: 7, tono: '#829780' },
    { x: 730, y: 433, rx: 8, ry: 4, tono: '#a0ae91' }
  ];
  piedras.forEach(p => {
    ctx.fillStyle = 'rgba(24,65,38,0.16)';
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 3, p.rx * 1.08, p.ry * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(p.x, p.y - p.ry, p.x, p.y + p.ry);
    g.addColorStop(0, '#b3c1a0'); g.addColorStop(0.45, p.tono); g.addColorStop(1, '#4f7158');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(235,244,202,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x - p.rx * 0.25, p.y - p.ry * 0.35, p.rx * 0.36, p.ry * 0.22, -0.2, 0, Math.PI * 2); ctx.fill();
  });

  // Tronco caído, colocado visualmente sobre el suelo y detrás de los elementos jugables.
  ctx.save(); ctx.translate(293, 423); ctx.rotate(-0.035);
  ctx.fillStyle = 'rgba(26,64,36,0.17)';
  ctx.beginPath(); ctx.ellipse(2, 7, 49, 8, 0, 0, Math.PI * 2); ctx.fill();
  const tronco = ctx.createLinearGradient(0, -10, 0, 10);
  tronco.addColorStop(0, '#9a7549'); tronco.addColorStop(0.42, '#765234'); tronco.addColorStop(1, '#4d3c2b');
  ctx.fillStyle = tronco; ctx.beginPath(); ctx.roundRect(-43, -7, 86, 15, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(53,43,28,0.72)'; ctx.lineWidth = 1.5;
  for (let i = -28; i <= 28; i += 14) {
    ctx.beginPath(); ctx.moveTo(i, -3); ctx.quadraticCurveTo(i + 5, 0, i + 1, 4); ctx.stroke();
  }
  ctx.fillStyle = '#b18b5b'; ctx.beginPath(); ctx.ellipse(42, 0, 5.5, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#60442e'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(42, 0, 3, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // Hongos pequeños en grupos separados, con tallo crema y sombrero rojizo apagado.
  const hongos = [
    { x: 153, y: 418, s: 0.78 },
    { x: 170, y: 425, s: 0.55 },
    { x: 558, y: 421, s: 0.7 },
    { x: 575, y: 428, s: 0.48 }
  ];
  hongos.forEach((h, i) => {
    ctx.save(); ctx.translate(h.x, h.y); ctx.scale(h.s, h.s);
    ctx.fillStyle = 'rgba(29,70,39,0.14)';
    ctx.beginPath(); ctx.ellipse(0, 2, 9, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6d9b0';
    ctx.beginPath(); ctx.roundRect(-2.2, -9, 4.4, 10, 2); ctx.fill();
    const sombrero = ctx.createLinearGradient(0, -18, 0, -7);
    sombrero.addColorStop(0, i % 2 ? '#d88768' : '#c96e5d');
    sombrero.addColorStop(1, '#8d5147'); ctx.fillStyle = sombrero;
    ctx.beginPath(); ctx.ellipse(0, -10, 8.5, 4.8, 0, Math.PI, Math.PI * 2); ctx.lineTo(8.5, -9.5); ctx.quadraticCurveTo(0, -5.5, -8.5, -9.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,235,196,0.78)';
    ctx.beginPath(); ctx.arc(-3, -12.2, 1, 0, Math.PI * 2); ctx.arc(2.5, -13, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  // Helechos y brotes pequeños, de baja altura para que el paisaje siga despejado.
  const plantas = [
    { x: 35, y: 434, escala: 0.9 },
    { x: 215, y: 433, escala: 0.72 },
    { x: 420, y: 436, escala: 0.78 },
    { x: 638, y: 434, escala: 0.86 },
    { x: 772, y: 436, escala: 0.7 }
  ];
  plantas.forEach((pl, i) => {
    ctx.save(); ctx.translate(pl.x, pl.y); ctx.scale(pl.escala, pl.escala);
    ctx.strokeStyle = '#39764b'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-2, -9, -8, -13); ctx.moveTo(0, 0); ctx.quadraticCurveTo(1, -11, 5, -15); ctx.moveTo(0, 0); ctx.quadraticCurveTo(5, -7, 11, -10); ctx.stroke();
    const hojas = [[-8,-13,-0.65],[5,-15,0.6],[11,-10,0.3],[-3,-8,-0.25]];
    hojas.forEach(([hx, hy, rot], j) => {
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(rot);
      ctx.fillStyle = (i + j) % 2 ? '#6eaa65' : '#4f965a';
      ctx.beginPath(); ctx.ellipse(0, 0, 4.4, 1.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    ctx.restore();
  });

  // Pequeños parches de musgo sobre el suelo, sin volumen jugable.
  [[104,437,15],[365,439,18],[609,438,12],[748,439,11]].forEach(([x,y,w]) => {
    ctx.fillStyle = 'rgba(116,165,91,0.42)';
    ctx.beginPath(); ctx.ellipse(x, y, w, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(181,206,119,0.38)';
    ctx.beginPath(); ctx.ellipse(x - 3, y - 1, w * 0.4, 1.1, -0.1, 0, Math.PI * 2); ctx.fill();
  });

  ctx.restore();
}

function dibujarSantuarioDecorativo(nivel) {
  ctx.save(); ctx.globalAlpha=0.32; ctx.fillStyle='#f7d774'; ctx.fillRect(365,300,70,80); ctx.beginPath(); ctx.moveTo(350,300); ctx.lineTo(400,255); ctx.lineTo(450,300); ctx.closePath(); ctx.fill(); ctx.restore();
}

function dibujarAguaAmbiental(nivel) {
  // V2.1: arroyos, charcos, gotas y reflejos puramente decorativos.
  // Se dibuja en el fondo, antes de personajes y enemigos; no añade colisiones.
  const bosque = [3, 6, 8, 10].includes(nivel);
  const fase = tiempoAmbiental;

  ctx.save();

  if (bosque) {
    // Arroyo fino y sinuoso al pie del bosque, sin cubrir toda la zona jugable.
    ctx.beginPath();
    ctx.moveTo(-12, 414);
    ctx.bezierCurveTo(92, 397 + Math.sin(fase * 0.35) * 2, 118, 438, 222, 426);
    ctx.bezierCurveTo(315, 414, 352, 441, 444, 428);
    ctx.bezierCurveTo(535, 414, 592, 438, 682, 420);
    ctx.bezierCurveTo(731, 411, 774, 419, 812, 409);
    ctx.lineTo(812, 451);
    ctx.lineTo(-12, 451);
    ctx.closePath();
    const arroyo = ctx.createLinearGradient(0, 408, 0, 451);
    arroyo.addColorStop(0, 'rgba(83, 190, 205, 0.46)');
    arroyo.addColorStop(0.5, 'rgba(47, 150, 184, 0.57)');
    arroyo.addColorStop(1, 'rgba(35, 115, 150, 0.42)');
    ctx.fillStyle = arroyo;
    ctx.fill();

    // Orillas suaves y musgo fino que separa visualmente el agua del suelo.
    ctx.strokeStyle = 'rgba(194, 224, 160, 0.48)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-5, 414);
    ctx.bezierCurveTo(92, 397, 118, 438, 222, 426);
    ctx.bezierCurveTo(315, 414, 352, 441, 444, 428);
    ctx.bezierCurveTo(535, 414, 592, 438, 682, 420);
    ctx.bezierCurveTo(731, 411, 774, 419, 805, 409);
    ctx.stroke();

    // Ondas cortas animadas: desplazamiento solo visual.
    for (let i = 0; i < 13; i++) {
      const x = ((i * 73 + fase * (15 + (i % 3) * 3)) % (canvas.width + 80)) - 40;
      const y = 419 + (i % 4) * 7 + Math.sin(fase * 1.4 + i) * 1.5;
      const largo = 10 + (i % 4) * 5;
      ctx.strokeStyle = i % 3 === 0
        ? 'rgba(255,255,230,0.72)'
        : 'rgba(190,242,245,0.48)';
      ctx.lineWidth = i % 3 === 0 ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + largo * 0.5, y - 1.8, x + largo, y);
      ctx.stroke();
    }

    // Pequeños charcos laterales en claros del suelo.
    dibujarCharcoDecorativo(112, 389, 29, 8, fase * 0.9);
    dibujarCharcoDecorativo(578, 390, 23, 6, fase * 0.75 + 1.2);
    dibujarCharcoDecorativo(730, 397, 18, 5, fase * 0.8 + 2.1);
  } else {
    // En praderas y jardines, solo pequeños charcos discretos en el suelo.
    dibujarCharcoDecorativo(96, 410, 24, 6, fase * 0.7);
    dibujarCharcoDecorativo(525, 405, 31, 7, fase * 0.65 + 1.4);
    if ([1, 4, 7, 11].includes(nivel)) {
      dibujarCharcoDecorativo(704, 417, 19, 5, fase * 0.8 + 2.4);
    }
  }

  // Gotas y destellos suspendidos muy cerca de la superficie, sin interacción.
  for (let i = 0; i < 7; i++) {
    const x = (i * 127 + 38 + Math.sin(fase * 0.55 + i) * 5) % canvas.width;
    const yBase = bosque ? 405 + (i % 3) * 5 : 397 + (i % 3) * 7;
    const pulse = (Math.sin(fase * 2.1 + i * 1.7) + 1) / 2;
    ctx.globalAlpha = 0.18 + pulse * 0.48;
    ctx.fillStyle = '#e9ffff';
    ctx.beginPath();
    ctx.ellipse(x, yBase - pulse * 2, 1.2 + pulse * 0.7, 2.1 + pulse, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function dibujarCharcoDecorativo(x, y, rx, ry, fase) {
  ctx.save();
  // Sombra tenue debajo del charco.
  ctx.fillStyle = 'rgba(28, 82, 74, 0.16)';
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 2, rx * 1.04, ry * 1.12, -0.04, 0, Math.PI * 2);
  ctx.fill();

  const agua = ctx.createLinearGradient(x, y - ry, x, y + ry);
  agua.addColorStop(0, 'rgba(174, 235, 230, 0.70)');
  agua.addColorStop(0.55, 'rgba(81, 177, 194, 0.62)');
  agua.addColorStop(1, 'rgba(49, 135, 160, 0.55)');
  ctx.fillStyle = agua;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, Math.sin(fase) * 0.025, 0, Math.PI * 2);
  ctx.fill();

  // Reflejo de cielo y dos pequeñas ondas animadas.
  ctx.strokeStyle = 'rgba(245, 255, 238, 0.78)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.12, y - ry * 0.18, rx * 0.53, ry * 0.42, 0, Math.PI * 1.05, Math.PI * 1.85);
  ctx.stroke();

  const shift = Math.sin(fase * 1.6) * rx * 0.18;
  ctx.strokeStyle = 'rgba(225, 255, 255, 0.52)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.48 + shift, y + ry * 0.18);
  ctx.quadraticCurveTo(x + shift, y + ry * 0.02, x + rx * 0.44 + shift, y + ry * 0.16);
  ctx.stroke();

  // Un destello pequeño que aparece y se atenúa lentamente.
  ctx.globalAlpha = 0.25 + ((Math.sin(fase * 2.2) + 1) / 2) * 0.45;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.24, y - ry * 0.22, 2.4, 1.0, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Compatibilidad con llamadas antiguas: conserva el nombre histórico sin crear un lago
// que cubra el suelo completo. El render actual usa dibujarAguaAmbiental().
function dibujarReflejosAgua() {
  dibujarAguaAmbiental(currentLevel || 8);
}

function dibujarColinas(c1,c2) { ctx.fillStyle=c1; ctx.beginPath();ctx.moveTo(0,360);ctx.quadraticCurveTo(160,260,320,360);ctx.quadraticCurveTo(500,245,800,350);ctx.lineTo(800,450);ctx.lineTo(0,450);ctx.closePath();ctx.fill(); ctx.fillStyle=c2;ctx.beginPath();ctx.moveTo(0,395);ctx.quadraticCurveTo(180,310,370,395);ctx.quadraticCurveTo(560,300,800,390);ctx.lineTo(800,450);ctx.lineTo(0,450);ctx.closePath();ctx.fill(); }

function dibujarFloresDecorativas(cantidad) {
  ctx.save();
  // V1.9: flores ornamentales que responden a una brisa visual suave.
  // Es decoración de renderizado: no altera hitboxes, objetos ni mecánicas.
  const colores=['#ff6b81','#ffd166','#9b8cff','#fff7ee','#f78fb3','#7ed6df'];
  const brisa = Math.sin(tiempoAmbiental * 0.72) * 1.9 + Math.sin(tiempoAmbiental * 1.31 + 0.8) * 0.7;
  for(let i=0;i<cantidad;i++){
    const x=(i*83)%790+5;
    const y=365+(i%4)*18;
    const fase = tiempoAmbiental * (1.15 + (i%4)*0.08) + i*0.73;
    const balanceo=Math.sin(fase)*1.15 + brisa * (0.7 + (i%3)*0.13);
    const alto=8+(i%3)*2;
    const inclinacion = balanceo * 0.11;
    ctx.strokeStyle='rgba(38,112,57,0.88)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(x,y+5); ctx.quadraticCurveTo(x+balanceo*0.35-2,y+alto,x+balanceo,y+alto+5); ctx.stroke();
    ctx.fillStyle=i%2?'#58a85a':'#78bd61';
    ctx.beginPath(); ctx.ellipse(x+balanceo*0.45-4,y+alto-1,4,2, -0.45+inclinacion,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+balanceo*0.75+4,y+alto+2,3.5,1.8, 0.5+inclinacion,0,Math.PI*2); ctx.fill();
    const petalo=colores[i%colores.length];
    for(let j=0;j<5;j++){
      const a=j*Math.PI*2/5 + tiempoAmbiental*0.035 + inclinacion;
      ctx.fillStyle=petalo; ctx.beginPath();
      ctx.ellipse(x+balanceo+Math.cos(a)*4.2,y+Math.sin(a)*4.2,3.6,2.6,a,0,Math.PI*2); ctx.fill();
    }
    ctx.fillStyle='#f6c94b'; ctx.beginPath(); ctx.arc(x+balanceo,y,2.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,220,0.65)'; ctx.beginPath(); ctx.arc(x+balanceo-0.7,y-0.8,0.8,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function dibujarDetallesAmbientales(nivel) {
  // V1.9: hojas y motas de polen responden a una brisa determinista.
  // Solo afecta a sus coordenadas dibujadas; no interviene en la lógica del juego.
  ctx.save();
  const bosque = [3,6,8,10].includes(nivel);
  const brisa = Math.sin(tiempoAmbiental * 0.72) * 1.9 + Math.sin(tiempoAmbiental * 1.31 + 0.8) * 0.7;

  // Hojas flotantes: deriva lateral que cambia con el viento y giro suave.
  for (let i=0; i<7; i++) {
    const baseX=(i*137+45)%860;
    const derivaViento = Math.sin(tiempoAmbiental * 0.72 + i * 0.65) * 24 + brisa * 4.5;
    const x=((baseX + tiempoAmbiental*(7+(i%3)*2) + derivaViento)%860)-25;
    const y=65 + (i*53)%245 + Math.sin(tiempoAmbiental*0.8+i*1.7)*12 + Math.cos(tiempoAmbiental*0.65+i)*4;
    const giro=Math.sin(tiempoAmbiental*1.1+i)*0.52 + brisa*0.12 + Math.sin(tiempoAmbiental*1.8+i*0.4)*0.16;
    const escala=0.65+(i%3)*0.18;
    ctx.save(); ctx.translate(x,y); ctx.rotate(giro); ctx.scale(escala,escala);
    ctx.fillStyle=['rgba(74,151,73,0.54)','rgba(126,177,75,0.52)','rgba(183,194,91,0.46)'][i%3];
    ctx.beginPath(); ctx.moveTo(-9,0); ctx.quadraticCurveTo(-2,-10,9,-5); ctx.quadraticCurveTo(6,5,-9,0); ctx.fill();
    ctx.strokeStyle='rgba(43,112,57,0.55)'; ctx.lineWidth=0.8; ctx.beginPath(); ctx.moveTo(-7,0); ctx.lineTo(7,-4); ctx.stroke();
    ctx.restore();
  }

  // Motas doradas que ascienden y derivan lateralmente siguiendo la brisa.
  for (let i=0; i<18; i++) {
    const derivaPolen = Math.sin(tiempoAmbiental * 0.72 + i * 0.52) * 16 + brisa * (2.2 + (i%3)*0.55);
    const x=(i*97 + Math.sin(tiempoAmbiental*0.55+i)*18 + tiempoAmbiental*(1.5+(i%3)*0.5) + derivaPolen + 20 + canvas.width*2)%canvas.width;
    const y=55 + ((i*67 - tiempoAmbiental*(5+(i%4)*2) + Math.sin(tiempoAmbiental*1.2+i)*5)%285 + 285)%285;
    const pulso = 0.4 + (Math.sin(tiempoAmbiental*2.1+i*1.3)+1)*0.22 + Math.min(0.12, Math.abs(brisa)*0.035);
    ctx.globalAlpha=pulso*(bosque?0.72:0.58);
    ctx.fillStyle=i%4===0?'#fff2a8':'#f8d66d';
    ctx.beginPath(); ctx.arc(x,y,i%5===0?2:1.25,0,Math.PI*2); ctx.fill();
  }

  // En el bosque aparecen unas pocas luces cálidas, discretas.
  if (bosque) {
    for (let i=0; i<5; i++) {
      const x=(i*173+70)%canvas.width;
      const y=150+(i%3)*52+Math.sin(tiempoAmbiental*1.2+i)*8;
      const r=2.2+Math.sin(tiempoAmbiental*2+i)*0.7;
      ctx.globalAlpha=0.18+((Math.sin(tiempoAmbiental*2.4+i)+1)*0.12);
      ctx.fillStyle='#fff2a6'; ctx.beginPath(); ctx.arc(x,y,r*2.8,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=0.8; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
}



// V2.2: fauna ambiental vectorial. Movimiento determinista y solo visual.
// No usa físicas, hitboxes, temporizadores de juego ni participa en colisiones.
function dibujarFaunaDecorativa(nivel) {
  ctx.save();
  const bosque = [3, 6, 8, 10].includes(nivel);
  const praderaFlor = [4, 7].includes(nivel);
  const cantidadMariposas = praderaFlor ? 5 : (bosque ? 3 : 4);
  const cantidadLibelulas = bosque ? 3 : 2;

  // Mariposas pequeñas: trayectoria flotante, alas que baten y paleta natural.
  const coloresAlas = [
    ['#f5a7cb', '#ffe6f0'],
    ['#f7c65b', '#fff0a8'],
    ['#9dd9f4', '#e5f8ff'],
    ['#c5a6ee', '#f1e8ff'],
    ['#f4a37c', '#ffe2c9']
  ];
  for (let i = 0; i < cantidadMariposas; i++) {
    const fase = tiempoAmbiental * (0.48 + (i % 3) * 0.07) + i * 2.15;
    const x = ((i * 157 + 55 + tiempoAmbiental * (10 + (i % 2) * 4)
      + Math.sin(fase * 0.8) * 24) % (canvas.width + 50)) - 25;
    const y = 95 + (i * 47) % 150 + Math.sin(fase * 1.3) * 17;
    const giro = Math.sin(fase * 0.7) * 0.22;
    const batir = 0.35 + Math.abs(Math.sin(tiempoAmbiental * 8.5 + i * 1.7)) * 0.65;
    const paleta = coloresAlas[i % coloresAlas.length];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(giro);
    ctx.scale(0.72 + (i % 3) * 0.09, 0.72 + (i % 2) * 0.08);
    ctx.globalAlpha = 0.86;

    // Alas superiores e inferiores, con batido simétrico.
    ctx.fillStyle = paleta[0];
    ctx.beginPath();
    ctx.ellipse(-4.5, -2, 5.2 * batir, 6.2, -0.35, 0, Math.PI * 2);
    ctx.ellipse(4.5, -2, 5.2 * batir, 6.2, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paleta[1];
    ctx.beginPath();
    ctx.ellipse(-3.5, 4, 3.6 * batir, 4.0, -0.5, 0, Math.PI * 2);
    ctx.ellipse(3.5, 4, 3.6 * batir, 4.0, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Cuerpo y antenas.
    ctx.strokeStyle = 'rgba(75, 65, 55, 0.78)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1, -3); ctx.quadraticCurveTo(-4, -7, -5, -7);
    ctx.moveTo(1, -3); ctx.quadraticCurveTo(4, -7, 5, -7);
    ctx.stroke();
    ctx.fillStyle = '#51483d';
    ctx.beginPath(); ctx.ellipse(0, 1, 1.25, 5.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Libélulas: cuerpo fino, cuatro alas translúcidas y desplazamiento algo más rápido.
  for (let i = 0; i < cantidadLibelulas; i++) {
    const fase = tiempoAmbiental * (0.7 + (i % 2) * 0.12) + i * 2.8;
    const x = ((i * 239 + 110 - tiempoAmbiental * (13 + i * 1.5)
      + Math.sin(fase) * 20) % (canvas.width + 60) + canvas.width + 60) % (canvas.width + 60) - 30;
    const y = 145 + (i * 39) % 105 + Math.sin(fase * 1.5) * 13;
    const giro = Math.sin(fase * 0.85) * 0.32;
    const aleteo = Math.sin(tiempoAmbiental * 11 + i) * 1.7;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(giro);
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(198, 244, 242, 0.76)';
    ctx.strokeStyle = 'rgba(90, 164, 170, 0.62)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(-4, -2.5 + aleteo, 6.3, 1.8, -0.24, 0, Math.PI * 2);
    ctx.ellipse(3.5, -2.5 - aleteo, 6.3, 1.8, 0.24, 0, Math.PI * 2);
    ctx.ellipse(-3.5, 2.5 - aleteo, 5.3, 1.5, 0.22, 0, Math.PI * 2);
    ctx.ellipse(4, 2.5 + aleteo, 5.3, 1.5, -0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = i % 2 === 0 ? '#4f9d83' : '#658fae';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 0); ctx.lineTo(8, 0); ctx.stroke();
    ctx.fillStyle = '#526f66';
    ctx.beginPath(); ctx.arc(-3, 0, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// V2.3: luciérnagas luminosas y lentas, dibujadas únicamente en el fondo.
// No son objetos jugables: no tienen hitboxes, físicas ni efectos sobre las mecánicas.
function dibujarLuciernagasAmbientales(nivel) {
  ctx.save();

  // Se concentran en el bosque y aparecen con menor intensidad en el atardecer.
  const bosque = [3, 6, 8, 10].includes(nivel);
  const atardecer = nivel === 5;
  if (!bosque && !atardecer) {
    ctx.restore();
    return;
  }

  const cantidad = bosque ? 15 : 7;
  for (let i = 0; i < cantidad; i++) {
    // Posiciones deterministas con deriva suave: no se generan elementos aleatorios cada cuadro.
    const baseX = (i * 67 + 29) % canvas.width;
    const baseY = bosque
      ? 115 + ((i * 43) % 205)
      : 150 + ((i * 31) % 145);
    const x = (baseX + Math.sin(tiempoAmbiental * (0.28 + (i % 4) * 0.045) + i * 1.7) * (10 + (i % 3) * 3) + canvas.width) % canvas.width;
    const y = baseY + Math.sin(tiempoAmbiental * 0.52 + i * 2.1) * (7 + (i % 3) * 2);
    const pulso = 0.35 + (Math.sin(tiempoAmbiental * 2.1 + i * 1.83) + 1) * 0.30;
    const radio = 2.0 + (i % 3) * 0.35;
    const color = atardecer ? '255, 211, 104' : '190, 255, 123';

    // Halo difuminado y núcleo pequeño para un brillo cálido, sin cubrir el escenario.
    const halo = ctx.createRadialGradient(x, y, 0, x, y, radio * 5.5);
    halo.addColorStop(0, `rgba(${color},${0.34 * pulso})`);
    halo.addColorStop(0.35, `rgba(${color},${0.16 * pulso})`);
    halo.addColorStop(1, `rgba(${color},0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, radio * 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = Math.min(0.92, pulso + 0.18);
    ctx.fillStyle = atardecer ? '#fff0b3' : '#eaffbd';
    ctx.shadowColor = atardecer ? '#ffd36a' : '#bfff75';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(x, y, radio * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// V2.5: iluminación natural por capas. Solo afecta al renderizado; no modifica mecánicas.
function dibujarIluminacionAmbiental(nivel) {
  ctx.save();
  const bosque = [3, 6, 8, 10].includes(nivel);
  const atardecer = nivel === 5;
  const pradera = [1, 2, 4, 7, 9].includes(nivel);
  const tono = atardecer ? '255,177,100' : bosque ? '255,239,177' : '255,247,202';
  const origenX = bosque ? 125 : atardecer ? 705 : 690;
  const origenY = bosque ? 56 : 62;
  const pulsoLento = (Math.sin(tiempoAmbiental * 0.28) + 1) * 0.5;

  // 1. Resplandor amplio de la fuente de luz, con bordes difusos.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const haloExterior = ctx.createRadialGradient(origenX, origenY, 3, origenX, origenY, bosque ? 350 : 315);
  haloExterior.addColorStop(0, `rgba(${tono},${atardecer ? 0.18 : 0.115 + pulsoLento * 0.018})`);
  haloExterior.addColorStop(0.38, `rgba(${tono},${atardecer ? 0.075 : 0.045})`);
  haloExterior.addColorStop(1, `rgba(${tono},0)`);
  ctx.fillStyle = haloExterior;
  ctx.fillRect(0, 0, canvas.width, canvas.height * 0.9);

  // Brillo central del sol: discreto para no competir con los personajes.
  const nucleo = ctx.createRadialGradient(origenX, origenY, 0, origenX, origenY, 82);
  nucleo.addColorStop(0, `rgba(255,255,232,${atardecer ? 0.20 : 0.15})`);
  nucleo.addColorStop(0.25, `rgba(${tono},0.09)`);
  nucleo.addColorStop(1, `rgba(${tono},0)`);
  ctx.fillStyle = nucleo;
  ctx.fillRect(origenX - 85, origenY - 85, 170, 170);
  ctx.restore();

  // 2. Rayos de luz de bordes suaves; se desplazan muy lentamente.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 5; i++) {
    const deriva = Math.sin(tiempoAmbiental * 0.12 + i * 1.25) * 13;
    const x = origenX + (bosque ? 35 : -42) * i + deriva;
    const anchoSuperior = 9 + (i % 3) * 6;
    const finalY = bosque ? 300 + (i % 2) * 34 : 248 + (i % 2) * 28;
    const alpha = (bosque ? 0.026 : 0.021) + pulsoLento * 0.008;
    const rayo = ctx.createLinearGradient(x, 0, x + 64, finalY);
    rayo.addColorStop(0, `rgba(${tono},${alpha})`);
    rayo.addColorStop(0.48, `rgba(${tono},${alpha * 0.65})`);
    rayo.addColorStop(1, `rgba(${tono},0)`);
    ctx.fillStyle = rayo;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + anchoSuperior, 0);
    ctx.lineTo(x + 64, finalY);
    ctx.lineTo(x + 28, finalY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 3. Rebote de luz cálida sobre la parte superior de la vegetación y el suelo.
  const rebote = ctx.createLinearGradient(0, 286, 0, canvas.height);
  rebote.addColorStop(0, `rgba(${atardecer ? '255,196,125' : '235,255,180'},0)`);
  rebote.addColorStop(0.58, `rgba(${atardecer ? '255,196,125' : '235,255,180'},${bosque ? 0.025 : 0.035})`);
  rebote.addColorStop(1, `rgba(${atardecer ? '255,196,125' : '235,255,180'},${bosque ? 0.065 : 0.045})`);
  ctx.fillStyle = rebote;
  ctx.fillRect(0, 286, canvas.width, canvas.height - 286);

  // 4. Bruma atmosférica tenue para separar visualmente los planos del fondo.
  const bruma = ctx.createLinearGradient(0, 135, 0, 350);
  bruma.addColorStop(0, `rgba(${atardecer ? '255,218,169' : '225,247,218'},0)`);
  bruma.addColorStop(0.55, `rgba(${atardecer ? '255,218,169' : '225,247,218'},${bosque ? 0.035 : 0.025})`);
  bruma.addColorStop(1, 'rgba(225,247,218,0)');
  ctx.fillStyle = bruma;
  ctx.fillRect(0, 135, canvas.width, 215);

  // 5. Mantener el anclaje visual del terreno sin oscurecer excesivamente las flores.
  const sombraSuelo = ctx.createLinearGradient(0, 350, 0, canvas.height);
  sombraSuelo.addColorStop(0, 'rgba(18,58,34,0)');
  sombraSuelo.addColorStop(1, bosque ? 'rgba(17,57,32,0.085)' : 'rgba(42,83,36,0.045)');
  ctx.fillStyle = sombraSuelo;
  ctx.fillRect(0, 350, canvas.width, canvas.height - 350);

  // 6. Motas de polen suspendidas en la luz: pequeñas, suaves y no interactivas.
  for (let i = 0; i < 9; i++) {
    const x = (i * 97 + 58 + Math.sin(tiempoAmbiental * 0.18 + i * 0.8) * 15) % canvas.width;
    const y = 70 + ((i * 37) % 235) + Math.sin(tiempoAmbiental * 0.3 + i * 1.3) * 6;
    const pulso = 0.10 + (Math.sin(tiempoAmbiental * 0.9 + i * 1.6) + 1) * 0.075;
    const radio = 0.8 + (i % 3) * 0.35;
    ctx.save();
    ctx.globalAlpha = pulso;
    ctx.fillStyle = atardecer ? '#fff0cc' : '#fffbe0';
    ctx.shadowColor = atardecer ? '#ffd18a' : '#fff3b0';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(x, y, radio, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
function dibujarZonasRescateDecorativas() { ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=3; [230,400,570].forEach(x=>{ctx.beginPath();ctx.arc(x,315,28,0,Math.PI*2);ctx.stroke();}); ctx.restore(); }

function dibujarFlor(x, y) {
  // CAM-VISUAL-04: flores/polen mejorados. Solo modifica el dibujo del recolectable;
  // no altera posición, colisión, cantidad, puntuación ni lógica de recolección.
  ctx.save();
  const pulso = 1 + Math.sin(tiempoAmbiental * 2.4 + x * 0.03 + y * 0.02) * 0.06;
  const balanceo = Math.sin(tiempoAmbiental * 1.8 + x * 0.025) * 1.5;
  const colores = ['#ff5f6d', '#ffd166', '#9b8cff', '#ff8fab'];
  const colorPetalo = colores[Math.floor(Math.abs(x + y)) % colores.length];

  ctx.translate(x + balanceo, y);
  ctx.scale(pulso, pulso);

  // V2.4: sombra de contacto suave bajo la flor para integrarla mejor al escenario.
  // Es exclusivamente visual: no altera la posición ni el área de recolección.
  const sombraFlor = ctx.createRadialGradient(0, 12, 1, 0, 12, 14);
  sombraFlor.addColorStop(0, 'rgba(26, 53, 27, 0.30)');
  sombraFlor.addColorStop(0.62, 'rgba(26, 53, 27, 0.13)');
  sombraFlor.addColorStop(1, 'rgba(26, 53, 27, 0)');
  ctx.fillStyle = sombraFlor;
  ctx.beginPath(); ctx.ellipse(0, 12, 14, 4.5, 0, 0, Math.PI * 2); ctx.fill();

  // Brillo exterior suave.
  ctx.fillStyle = 'rgba(255, 244, 170, 0.18)';
  ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();

  // Pétalos.
  ctx.fillStyle = colorPetalo;
  for (let i = 0; i < 5; i++) {
    const ang = (i * Math.PI * 2) / 5 - Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(ang) * 8, Math.sin(ang) * 8, 7, 5.5, ang, 0, Math.PI * 2);
    ctx.fill();
  }

  // Centro de polen.
  ctx.fillStyle = '#f5b642';
  ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff4b0';
  ctx.beginPath(); ctx.arc(-2, -2, 2.2, 0, Math.PI * 2); ctx.fill();

  // Destellos muy pequeños para dar sensación de polen.
  const brillo = 0.45 + Math.sin(tiempoAmbiental * 3 + x * 0.04) * 0.25;
  ctx.globalAlpha = Math.max(0.15, brillo);
  ctx.fillStyle = '#fff7b2';
  for (let i = 0; i < 3; i++) {
    const a = tiempoAmbiental * 0.8 + i * 2.1 + x * 0.01;
    const r = 12 + (i % 2) * 3;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function dibujarAspersor(x, y, w, h) {
  // CAM-ENEMIGOS-VISUAL-01: aspersor más reconocible y animado.
  // Solo cambia el dibujo; el movimiento y las colisiones permanecen intactos.
  ctx.save();
  const t = Date.now() / 180;
  const cx = x + w / 2;
  const baseY = y + h * 0.88;
  const headY = y + h * 0.36;

  // Sombra y soporte metálico.
  ctx.fillStyle = 'rgba(25,55,40,0.20)';
  ctx.beginPath(); ctx.ellipse(cx, baseY + 2, w * 0.34, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#566b70';
  ctx.fillRect(cx - w * 0.10, headY, w * 0.20, h * 0.52);
  ctx.fillStyle = '#aab9b9';
  ctx.fillRect(cx - w * 0.055, headY + h * 0.05, w * 0.11, h * 0.40);

  // Cabezal con reflejos.
  const grad = ctx.createLinearGradient(x, headY, x + w, headY + h * 0.24);
  grad.addColorStop(0, '#1f78a8'); grad.addColorStop(0.48, '#62c5ed'); grad.addColorStop(1, '#155477');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(cx - w * 0.34, headY - h * 0.08, w * 0.68, h * 0.28, 6); ctx.fill();
  ctx.fillStyle = '#d8f5ff';
  ctx.beginPath(); ctx.arc(cx - w * 0.12, headY, Math.max(2, w * 0.045), 0, Math.PI * 2); ctx.fill();

  // Chorros de agua animados.
  for (let i = 0; i < 5; i++) {
    const phase = (t + i * 0.38) % 1.8;
    const dx = (i - 2) * w * 0.22;
    const spread = (i - 2) * w * 0.19;
    const dropY = headY + h * 0.22 + phase * h * 0.57;
    ctx.globalAlpha = Math.max(0.12, 0.82 - phase / 2.1);
    ctx.fillStyle = i % 2 ? '#7edcff' : '#d9f8ff';
    ctx.beginPath(); ctx.ellipse(cx + dx + spread * phase, dropY, 2.2, 3.5, -0.25, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function dibujarPesticida(x, y, w, h) {
  // CAM-ENEMIGOS-VISUAL-01: envase de pesticida con brillo y nube tóxica.
  // La zona de daño y la lógica del enemigo no se modifican.
  ctx.save();
  const t = Date.now() / 220;
  const pulse = 1 + Math.sin(t) * 0.045;
  const cx = x + w / 2, cy = y + h / 2;

  // Aura de peligro.
  const aura = ctx.createRadialGradient(cx, cy, w * 0.12, cx, cy, w * 0.78 * pulse);
  aura.addColorStop(0, 'rgba(191,105,232,0.26)');
  aura.addColorStop(1, 'rgba(142,68,173,0)');
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(cx, cy, w * 0.82 * pulse, 0, Math.PI * 2); ctx.fill();

  // Cuerpo del frasco.
  const bottle = ctx.createLinearGradient(x + w * 0.18, y, x + w * 0.82, y + h);
  bottle.addColorStop(0, '#b66bd0'); bottle.addColorStop(0.45, '#74319a'); bottle.addColorStop(1, '#48205f');
  ctx.fillStyle = bottle;
  ctx.beginPath(); ctx.roundRect(x + w * 0.16, y + h * 0.22, w * 0.68, h * 0.70, Math.min(8, w * 0.13)); ctx.fill();
  ctx.fillStyle = '#d8b5e8';
  ctx.beginPath(); ctx.roundRect(x + w * 0.34, y + h * 0.07, w * 0.32, h * 0.20, 3); ctx.fill();
  ctx.fillStyle = '#54216e';
  ctx.fillRect(x + w * 0.31, y + h * 0.05, w * 0.38, h * 0.07);

  // Etiqueta de advertencia y símbolo.
  ctx.fillStyle = '#f7e6a1';
  ctx.beginPath(); ctx.roundRect(x + w * 0.23, y + h * 0.42, w * 0.54, h * 0.34, 3); ctx.fill();
  ctx.fillStyle = '#54216e';
  ctx.font = `bold ${Math.max(9, Math.floor(w * 0.29))}px Arial`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('☣', cx, y + h * 0.59);

  // Pequeñas burbujas alrededor del peligro.
  for (let i = 0; i < 4; i++) {
    const a = t * 0.75 + i * Math.PI / 2;
    const r = w * (0.43 + 0.05 * Math.sin(t + i));
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t + i);
    ctx.fillStyle = '#dca6f0';
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.1 + (i % 2), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function dibujarAvispa(x, y, w, h) {
  // CAM-ENEMIGOS-VISUAL-01: avispa más detallada, con alas, franjas y aguijón.
  // No altera posición lógica, velocidad, hitbox ni daño.
  ctx.save();
  const t = Date.now();
  const cx = x + w / 2;
  const cy = y + h / 2 + Math.sin(t / 95 + x * 0.02) * 1.5;
  const wingBeat = Math.sin(t / 42) * 0.48;
  const bodyW = w * 0.70;
  const bodyH = h * 0.43;

  // Sombra suave.
  ctx.fillStyle = 'rgba(30,45,25,0.16)';
  ctx.beginPath(); ctx.ellipse(cx, y + h * 0.82, w * 0.34, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();

  // Alas traslúcidas con venas.
  ctx.save();
  ctx.translate(cx, cy - h * 0.17);
  ctx.rotate(wingBeat);
  const wingGrad = ctx.createLinearGradient(-w * 0.48, -h * 0.3, w * 0.48, h * 0.12);
  wingGrad.addColorStop(0, 'rgba(206,244,255,0.72)');
  wingGrad.addColorStop(1, 'rgba(117,196,218,0.30)');
  ctx.fillStyle = wingGrad; ctx.strokeStyle = 'rgba(89,151,170,0.8)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(-w * 0.22, -h * 0.10, w * 0.27, h * 0.15, -0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(w * 0.22, -h * 0.10, w * 0.27, h * 0.15, 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-w * 0.37, -h * 0.12); ctx.lineTo(-w * 0.12, -h * 0.04); ctx.moveTo(w * 0.37, -h * 0.12); ctx.lineTo(w * 0.12, -h * 0.04); ctx.stroke();
  ctx.restore();

  // Patas pequeñas.
  ctx.strokeStyle = '#3b2b18'; ctx.lineWidth = Math.max(1.3, w * 0.035); ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const lx = cx + i * w * 0.14;
    ctx.beginPath(); ctx.moveTo(lx, cy + h * 0.13); ctx.lineTo(lx + i * w * 0.10, cy + h * 0.30); ctx.stroke();
  }

  // Abdomen amarillo con franjas oscuras.
  const abdomen = ctx.createLinearGradient(cx - bodyW / 2, cy - bodyH / 2, cx + bodyW / 2, cy + bodyH / 2);
  abdomen.addColorStop(0, '#ffdb55'); abdomen.addColorStop(0.55, '#f6a91b'); abdomen.addColorStop(1, '#d97706');
  ctx.fillStyle = abdomen;
  ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.06, bodyW * 0.52, bodyH * 0.58, -0.06, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.06, bodyW * 0.52, bodyH * 0.58, -0.06, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = '#30251a'; ctx.lineWidth = Math.max(3, w * 0.11);
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(cx + i * w * 0.18, cy - h * 0.18); ctx.lineTo(cx + i * w * 0.18 - w * 0.04, cy + h * 0.31); ctx.stroke();
  }
  ctx.restore();

  // Cabeza, ojos y antenas.
  const headX = cx + w * 0.27, headY = cy - h * 0.03;
  ctx.fillStyle = '#33291d';
  ctx.beginPath(); ctx.arc(headX, headY, w * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(headX + w * 0.035, headY - h * 0.035, w * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#151515'; ctx.beginPath(); ctx.arc(headX + w * 0.05, headY - h * 0.03, w * 0.022, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#33291d'; ctx.lineWidth = Math.max(1.2, w * 0.025);
  ctx.beginPath(); ctx.moveTo(headX, headY - h * 0.10); ctx.quadraticCurveTo(headX + w * 0.02, headY - h * 0.28, headX + w * 0.12, headY - h * 0.25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(headX - w * 0.04, headY - h * 0.09); ctx.quadraticCurveTo(headX - w * 0.12, headY - h * 0.25, headX - w * 0.16, headY - h * 0.21); ctx.stroke();

  // Aguijón.
  ctx.fillStyle = '#2a2119';
  ctx.beginPath(); ctx.moveTo(cx - bodyW * 0.47, cy + h * 0.08); ctx.lineTo(cx - bodyW * 0.66, cy + h * 0.13); ctx.lineTo(cx - bodyW * 0.47, cy + h * 0.18); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function dibujarAbejaVectorial(x, y, w, h, mainColor, shieldActive = false) {
  // CAM-VISUAL-07: rediseño del aspecto y animación de las abejas.
  // Cambio solo visual: conserva parámetros, posiciones lógicas, colisiones,
  // controles, daño, puntuación, escudos y progresión del juego.
  ctx.save();

  const t = Date.now();
  const floatOffset = Math.sin(t / 100) * 3;
  const wingBeat = Math.sin(t / 42) * 0.34;
  const bodyPulse = 1 + Math.sin(t / 170) * 0.018;
  const py = y + floatOffset;
  const cx = x + w / 2;
  const cy = py + h / 2;

  // V2.4: sombra ambiental bajo la abeja, separada visualmente del cuerpo.
  // El pequeño cambio de tamaño/opacidad acompaña el vuelo sin afectar la física.
  const elevacionVisual = Math.max(-1, Math.min(1, floatOffset / 3));
  const sombraX = x + w * 0.50;
  const sombraY = y + h * 0.91 - floatOffset * 0.22;
  const sombraAncho = w * (0.37 - elevacionVisual * 0.025);
  const sombraAlto = h * (0.105 - elevacionVisual * 0.008);
  const sombraAbeja = ctx.createRadialGradient(sombraX, sombraY, 1, sombraX, sombraY, sombraAncho * 1.35);
  sombraAbeja.addColorStop(0, `rgba(19, 43, 28, ${0.27 - elevacionVisual * 0.025})`);
  sombraAbeja.addColorStop(0.58, 'rgba(19, 43, 28, 0.13)');
  sombraAbeja.addColorStop(1, 'rgba(19, 43, 28, 0)');
  ctx.fillStyle = sombraAbeja;
  ctx.beginPath();
  ctx.ellipse(sombraX, sombraY, sombraAncho, sombraAlto, -0.04, 0, Math.PI * 2);
  ctx.fill();

  // Escudo visual sin alterar la mecánica original.
  if (shieldActive) {
    const shieldPulse = 1 + Math.sin(t / 95) * 0.035;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(shieldPulse, shieldPulse);
    ctx.strokeStyle = 'rgba(90, 210, 255, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(w, h) * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(90, 210, 255, 0.12)';
    ctx.fill();
    ctx.restore();
  }

  // Alas con doble capa translúcida y batido más expresivo.
  ctx.save();
  ctx.translate(cx - w * 0.02, cy - h * 0.29);
  ctx.rotate(-0.12 + wingBeat);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.strokeStyle = 'rgba(126,177,190,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(-w * 0.16, -h * 0.22, w * 0.20, h * (0.31 + Math.abs(wingBeat) * 0.07), -0.30, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(239,252,255,0.78)';
  ctx.beginPath();
  ctx.ellipse(w * 0.10, -h * 0.25, w * 0.17, h * (0.28 + Math.abs(wingBeat) * 0.05), 0.36, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Nervaduras delicadas de las alas.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-w * 0.23, -h * 0.24); ctx.lineTo(-w * 0.10, -h * 0.10);
  ctx.moveTo(w * 0.05, -h * 0.27); ctx.lineTo(w * 0.17, -h * 0.12);
  // V2.7: nervaduras secundarias muy finas para dar más detalle a las alas.
  ctx.strokeStyle = 'rgba(255,255,255,0.52)';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(-w * 0.19, -h * 0.25); ctx.quadraticCurveTo(-w * 0.16, -h * 0.19, -w * 0.12, -h * 0.15);
  ctx.moveTo(-w * 0.20, -h * 0.21); ctx.lineTo(-w * 0.15, -h * 0.13);
  ctx.moveTo(w * 0.08, -h * 0.26); ctx.quadraticCurveTo(w * 0.11, -h * 0.20, w * 0.15, -h * 0.15);
  ctx.moveTo(w * 0.11, -h * 0.25); ctx.lineTo(w * 0.18, -h * 0.17);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-w * 0.27, -h * 0.28); ctx.quadraticCurveTo(-w * 0.18, -h * 0.39, -w * 0.10, -h * 0.28);
  ctx.moveTo(w * 0.02, -h * 0.31); ctx.quadraticCurveTo(w * 0.10, -h * 0.39, w * 0.19, -h * 0.28);
  ctx.stroke();
  ctx.restore();

  // Patitas pequeñas, dibujadas detrás del cuerpo.
  ctx.strokeStyle = '#4a3925';
  ctx.lineWidth = Math.max(1, w * 0.025);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const lx = cx - w * 0.13 + i * w * 0.13;
    const swing = Math.sin(t / 85 + i * 0.8) * h * 0.035;
    ctx.beginPath();
    ctx.moveTo(lx, cy + h * 0.20);
    ctx.lineTo(lx - w * 0.035 + swing, cy + h * 0.34);
    ctx.lineTo(lx + w * 0.02 + swing, cy + h * 0.36);
    ctx.stroke();
  }

  // Cuerpo con gradiente cálido y leve respiración.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(bodyPulse, 1 / bodyPulse);
  const bodyGradient = ctx.createLinearGradient(-w * 0.46, -h * 0.25, w * 0.44, h * 0.22);
  bodyGradient.addColorStop(0, '#fff19a');
  bodyGradient.addColorStop(0.36, mainColor || '#f4c542');
  bodyGradient.addColorStop(1, '#d98c20');
  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = 'rgba(67,48,25,0.8)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.43, h * 0.34, -0.03, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Franjas redondeadas recortadas al cuerpo.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.43, h * 0.34, -0.03, 0, Math.PI * 2);
  ctx.clip();
  // Franjas con degradado propio: se distinguen mejor sobre el cuerpo curvo.
  const stripeGradient = ctx.createLinearGradient(0, -h * 0.30, 0, h * 0.30);
  stripeGradient.addColorStop(0, '#536069');
  stripeGradient.addColorStop(0.28, '#303b40');
  stripeGradient.addColorStop(0.72, '#20282c');
  stripeGradient.addColorStop(1, '#10191d');
  ctx.fillStyle = stripeGradient;
  ctx.beginPath(); ctx.ellipse(-w * 0.12, 0, w * 0.065, h * 0.39, -0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w * 0.13, 0, w * 0.065, h * 0.39, -0.08, 0, Math.PI * 2); ctx.fill();

  // V2.7: microvellosidad sutil sobre el cuerpo, limitada al contorno recortado.
  // Son trazos decorativos deterministas: no afectan a la animación ni a la lógica.
  ctx.lineWidth = 0.45;
  ctx.lineCap = 'round';
  for (let i = 0; i < 13; i++) {
    const hx = -w * 0.31 + i * w * 0.052;
    const hy = (i % 2 === 0 ? -1 : 1) * h * (0.19 + (i % 3) * 0.025);
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,250,205,0.48)' : 'rgba(83,60,29,0.25)';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + w * 0.018, hy + (hy < 0 ? -h * 0.045 : h * 0.045));
    ctx.stroke();
  }

  // V2.8: modelado de volumen del cuerpo con luz superior y sombra inferior.
  // Capa estrictamente visual, recortada a la silueta del abdomen.
  const bodyVolume = ctx.createLinearGradient(0, -h * 0.31, 0, h * 0.33);
  bodyVolume.addColorStop(0, 'rgba(255,255,235,0.48)');
  bodyVolume.addColorStop(0.24, 'rgba(255,255,255,0.10)');
  bodyVolume.addColorStop(0.58, 'rgba(255,255,255,0.00)');
  bodyVolume.addColorStop(1, 'rgba(35,22,12,0.42)');
  ctx.fillStyle = bodyVolume;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.43, h * 0.34, -0.03, 0, Math.PI * 2);
  ctx.fill();

  // Brillo especular fino para sugerir una superficie redondeada, sin efecto plástico fuerte.
  const bodyGlint = ctx.createRadialGradient(-w * 0.11, -h * 0.19, 1, -w * 0.11, -h * 0.19, w * 0.22);
  bodyGlint.addColorStop(0, 'rgba(255,255,245,0.40)');
  bodyGlint.addColorStop(1, 'rgba(255,255,238,0)');
  ctx.fillStyle = bodyGlint;
  ctx.beginPath();
  ctx.ellipse(-w * 0.11, -h * 0.15, w * 0.23, h * 0.16, -0.16, 0, Math.PI * 2);
  ctx.fill();

  // Reflejo suave sobre el lomo.
  ctx.fillStyle = 'rgba(255,255,230,0.78)';
  ctx.beginPath(); ctx.ellipse(-w * 0.08, -h * 0.17, w * 0.20, h * 0.075, -0.12, 0, Math.PI * 2); ctx.fill();

  // Borde de luz superior y rebote cálido inferior para separar el cuerpo del fondo.
  ctx.strokeStyle = 'rgba(255,248,190,0.72)';
  ctx.lineWidth = Math.max(0.8, w * 0.012);
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.405, h * 0.295, -0.03, Math.PI * 1.08, Math.PI * 1.88); ctx.stroke();
  ctx.strokeStyle = 'rgba(133,76,24,0.52)';
  ctx.lineWidth = Math.max(0.7, w * 0.009);
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.405, h * 0.30, -0.03, 0.12, Math.PI * 0.88); ctx.stroke();
  ctx.restore();
  ctx.restore();

  // Cabeza redondeada con brillo.
  const headX = cx + w * 0.34;
  const headY = cy - h * 0.015;
  const headGradient = ctx.createRadialGradient(headX - 3, headY - 4, 1, headX, headY, h * 0.27);
  headGradient.addColorStop(0, '#fff8c8');
  headGradient.addColorStop(0.38, mainColor || '#efb72f');
  headGradient.addColorStop(0.78, '#d89a27');
  headGradient.addColorStop(1, '#8f5a19');
  ctx.fillStyle = headGradient;
  ctx.strokeStyle = 'rgba(67,48,25,0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(headX, headY, h * 0.245, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Antenas animadas apenas, con puntas redondeadas.
  const antennaSway = Math.sin(t / 120) * 1.3;
  ctx.strokeStyle = '#4b3926';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(headX - 2, headY - h * 0.18);
  ctx.quadraticCurveTo(headX - 6 + antennaSway, headY - h * 0.40, headX - 9 + antennaSway, headY - h * 0.34);
  ctx.moveTo(headX + 4, headY - h * 0.18);
  ctx.quadraticCurveTo(headX + 8 + antennaSway, headY - h * 0.39, headX + 10 + antennaSway, headY - h * 0.32);
  ctx.stroke();

  // Ojo con brillo y sonrisa sutil.
  ctx.fillStyle = '#20282b';
  ctx.beginPath(); ctx.arc(headX + h * 0.075, headY - h * 0.035, Math.max(1.6, h * 0.065), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(headX + h * 0.09, headY - h * 0.06, Math.max(0.7, h * 0.025), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#79512d';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(headX + h * 0.12, headY + h * 0.055, h * 0.06, 0.15, 1.15); ctx.stroke();

  // Brillos de polen alrededor del vuelo, discretos y puramente decorativos.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#fff3a6';
  for (let i = 0; i < 3; i++) {
    const a = t / 260 + i * (Math.PI * 2 / 3);
    const px = cx - w * 0.48 + Math.cos(a) * (w * 0.12);
    const pyPollen = cy + Math.sin(a) * (h * 0.22);
    ctx.beginPath(); ctx.arc(px, pyPollen, 1.1 + (i % 2) * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function obtenerTextoViento() {
  const w = activeData && activeData.wind ? activeData.wind : {x:0, y:0};
  if (Math.abs(w.x) < 0.05 && Math.abs(w.y) < 0.05) return 'Viento: CALMA';
  const dir = [];
  if (w.y < -0.05) dir.push('↑');
  if (w.y > 0.05) dir.push('↓');
  if (w.x < -0.05) dir.push('←');
  if (w.x > 0.05) dir.push('→');
  return 'Viento: ' + dir.join('');
}


function dibujarObjetivosMision() {
  if (currentLevel < 7 || !activeData.mission) return;
  if (missionState.type === "rescate") {
    missionState.zones.forEach(z => {
      if (!z.active) return;
      ctx.save();
      ctx.strokeStyle = "#2ecc71"; ctx.lineWidth = 3; ctx.setLineDash([6,5]);
      ctx.beginPath(); ctx.arc(z.x,z.y,28,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle="#2ecc71"; ctx.font="bold 16px Arial"; ctx.textAlign="center";
      ctx.fillText("🌱",z.x,z.y+6); ctx.restore();
    });
  } else if (missionState.type === "fuentes") {
    missionState.zones.forEach(z => {
      ctx.save(); ctx.strokeStyle=z.active?"#3498db":"#2ecc71"; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(z.x,z.y,24,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle=z.active?"#3498db":"#2ecc71"; ctx.font="bold 15px Arial"; ctx.textAlign="center";
      ctx.fillText(z.active?"💧":"✓",z.x,z.y+5); ctx.restore();
    });
  } else if (missionState.type === "santuario") {
    missionState.zones.forEach(z => {
      ctx.save();
      ctx.strokeStyle = z.active ? "#f1c40f" : "#2ecc71"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(z.x, z.y, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = z.active ? "#f1c40f" : "#2ecc71";
      ctx.font = "bold 18px Arial"; ctx.textAlign = "center";
      ctx.fillText(z.active ? "👑" : "✓", z.x, z.y + 6); ctx.restore();
    });
    if (missionState.home) {
      const h = missionState.home;
      ctx.save(); ctx.strokeStyle = h.unlocked ? "#f1c40f" : "#8b949e"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(h.x, h.y, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = h.unlocked ? "#f1c40f" : "#8b949e"; ctx.font = "bold 22px Arial"; ctx.textAlign = "center";
      ctx.fillText("🏠", h.x, h.y + 7); ctx.restore();
    }
  } else if (missionState.type === "regreso" && missionState.home) {
    const h=missionState.home;
    ctx.save(); ctx.strokeStyle=h.unlocked?"#f1c40f":"#8b949e"; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(h.x,h.y,30,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle=h.unlocked?"#f1c40f":"#8b949e"; ctx.font="bold 22px Arial"; ctx.textAlign="center";
    ctx.fillText("🏠",h.x,h.y+7); ctx.restore();
  }
}

function drawHUD() {
  ctx.fillStyle = "#e74c3c"; ctx.font = "bold 15px Arial";
  ctx.fillText("Vidas: " + "❤️ ".repeat(Math.max(0, bee.lives)), 20, 25);
  ctx.fillStyle = "#f1c40f"; ctx.fillText("P1 Polen: " + bee.pollenCount, 180, 25);
  if (modoJuego === 2) {
    ctx.fillStyle = '#e67e22'; ctx.fillText('P2 Polen: ' + bee2.pollenCount, 300, 25);
  }
  ctx.fillStyle = "#1abc9c"; ctx.fillText("Nivel: " + currentLevel + " / " + maxLevels, 440, 25);
  ctx.fillStyle = "#fff"; ctx.fillText(`Meta Total: ${activeData.metaPolen}`, 580, 25);
  ctx.fillStyle = '#8fd3ff';
  ctx.fillText(obtenerTextoViento(), 680, 25);
  if (currentLevel >= 7) {
    ctx.fillStyle = "#58a6ff";
    ctx.font = "bold 13px Arial";
    ctx.fillText(textoMision(), 20, 45);
  }
}

function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}


// --- MENÚ, PAUSA, RECORD Y EFECTOS ---
function seleccionarModo(modo) {
  modoJuego = modo;
  document.getElementById('btn-single').classList.toggle('selected', modo === 1);
  document.getElementById('btn-coop').classList.toggle('selected', modo === 2);
  infoUI.innerText = modo === 2 ? 'Modo cooperativo: P1 Flechas | P2 W, A, S, D' : 'Modo individual: usa las flechas del teclado.';
}

function iniciarJuegoDesdeMenu() {
  juegoIniciado = true;
  juegoPausado = false;
  document.getElementById('menu-screen').style.display = 'none';
  document.getElementById('pause-screen').style.display = 'none';
  reiniciarJuegoCompleto();
}

function togglePausa() {
  if (!juegoIniciado || gameOver) return;
  juegoPausado = !juegoPausado;
  document.getElementById('pause-screen').style.display = juegoPausado ? 'flex' : 'none';
  phaseTitle.innerText = juegoPausado ? 'Juego pausado' : activeData.title;
}

function actualizarRecord() {
  const total = bee.pollenCount + (modoJuego === 2 ? bee2.pollenCount : 0);
  if (total > highscore) {
    highscore = total;
    localStorage.setItem('ecobeeHighscore', highscore);
  }
  const el = document.getElementById('highscore-display');
  if (el) el.innerText = '🏆 Récord de Polen: ' + highscore;
}

function addFloatingText(text, x, y, color = '#f1c40f') {
  floatingTexts.push({ text, x, y, alpha: 1, vy: -1.5, color });
}

function reproducirSonido(tipo) {
  // Audio opcional y seguro: si el navegador lo bloquea, el juego continúa.
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.frequency.value = tipo === 'daño' ? 160 : 620;
    gain.gain.setValueAtTime(0.04, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
    osc.start(); osc.stop(audioContext.currentTime + 0.12);
  } catch (_) {}
}

function triggerGameOver(victoria = false) {
  gameOver = true;
  if (victoria) actualizarRecord();
}

function actualizarEfectos() {
  if (screenShakeTimer > 0) screenShakeTimer--;
  floatingTexts.forEach(ft => { ft.y += ft.vy; ft.alpha -= 0.02; });
  floatingTexts = floatingTexts.filter(ft => ft.alpha > 0);
}

// Iniciar juego al cargar la página
initGame();