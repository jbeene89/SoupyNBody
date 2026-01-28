/**
 * SoupyNBody - Planetary Collision Simulator
 *
 * Detailed planets with procedural surfaces, moons, orbital mechanics,
 * massive collision events with debris, shockwaves, and coalescence.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { NBodyEngine, Body } from './physics.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    G: 40,
    softening: 0.3,
    timeScale: 1.0,
    debrisCount: 80000,
    debrisTrails: true,
    trailLength: 8,
    bloomStrength: 1.5,
    bloomRadius: 0.6,
    bloomThreshold: 0.2,
    backgroundStars: 5000,
    coalescenceRate: 0.0002,
    shockwaveSpeed: 60,
};

// ============================================================================
// Planet definitions - different types with unique visuals
// ============================================================================

const PLANET_TYPES = [
    {
        name: 'Molten Giant',
        radius: 3.5,
        mass: 500,
        colors: [0xff3300, 0xff6600, 0x330000, 0xff0000, 0xffaa00],
        emissive: 0xff2200,
        emissiveIntensity: 0.6,
        moons: 2,
        moonRadius: 0.3,
        moonOrbitRadius: 6,
        moonColor: 0x888888,
        bumpScale: 0.3,
        type: 'molten',
    },
    {
        name: 'Ice World',
        radius: 2.8,
        mass: 350,
        colors: [0x4488cc, 0x88bbee, 0xaaddff, 0x336699, 0xffffff],
        emissive: 0x112244,
        emissiveIntensity: 0.15,
        moons: 3,
        moonRadius: 0.25,
        moonOrbitRadius: 5.5,
        moonColor: 0xaabbcc,
        bumpScale: 0.15,
        type: 'ice',
    },
    {
        name: 'Gas Giant',
        radius: 4.2,
        mass: 700,
        colors: [0xcc8844, 0xddaa66, 0xbb7733, 0xeebb77, 0x996633],
        emissive: 0x221100,
        emissiveIntensity: 0.1,
        moons: 4,
        moonRadius: 0.35,
        moonOrbitRadius: 8,
        moonColor: 0xddccbb,
        bumpScale: 0.05,
        type: 'gas',
        hasRings: true,
    },
    {
        name: 'Terrestrial',
        radius: 2.2,
        mass: 250,
        colors: [0x228833, 0x2266aa, 0x44aa55, 0x1155aa, 0x886644],
        emissive: 0x001122,
        emissiveIntensity: 0.05,
        moons: 1,
        moonRadius: 0.4,
        moonOrbitRadius: 4.5,
        moonColor: 0xbbbbaa,
        bumpScale: 0.25,
        type: 'terrestrial',
    },
    {
        name: 'Toxic World',
        radius: 2.5,
        mass: 300,
        colors: [0x88aa00, 0xaacc22, 0x667700, 0xccee44, 0x445500],
        emissive: 0x334400,
        emissiveIntensity: 0.3,
        moons: 1,
        moonRadius: 0.2,
        moonOrbitRadius: 4,
        moonColor: 0x99aa77,
        bumpScale: 0.2,
        type: 'toxic',
    },
    {
        name: 'Crystal Planet',
        radius: 2.0,
        mass: 400,
        colors: [0x9933ff, 0xbb66ff, 0x6600cc, 0xdd99ff, 0x4400aa],
        emissive: 0x6622cc,
        emissiveIntensity: 0.5,
        moons: 2,
        moonRadius: 0.22,
        moonOrbitRadius: 4.2,
        moonColor: 0xccaaff,
        bumpScale: 0.35,
        type: 'crystal',
    },
    // --- Stellar remnants ---
    {
        name: 'Neutron Star',
        radius: 1.2,
        mass: 1200,
        colors: [0xccddff, 0xeeeeff, 0x8899cc, 0xffffff, 0xaabbff],
        emissive: 0x88aaff,
        emissiveIntensity: 1.5,
        moons: 0,
        moonRadius: 0,
        moonOrbitRadius: 0,
        moonColor: 0,
        bumpScale: 0.02,
        type: 'neutron',
        isStellar: true,
    },
    {
        name: 'Pulsar',
        radius: 1.0,
        mass: 1400,
        colors: [0x00ccff, 0x44eeff, 0x0066aa, 0x88ffff, 0x003366],
        emissive: 0x00aaff,
        emissiveIntensity: 2.0,
        moons: 0,
        moonRadius: 0,
        moonOrbitRadius: 0,
        moonColor: 0,
        bumpScale: 0.01,
        type: 'pulsar',
        isStellar: true,
    },
    {
        name: 'Magnetar',
        radius: 1.3,
        mass: 1600,
        colors: [0xff00ff, 0xff44aa, 0xaa00cc, 0xff88dd, 0x6600aa],
        emissive: 0xff00cc,
        emissiveIntensity: 2.5,
        moons: 0,
        moonRadius: 0,
        moonOrbitRadius: 0,
        moonColor: 0,
        bumpScale: 0.01,
        type: 'magnetar',
        isStellar: true,
    },
];

// ============================================================================
// Procedural texture generation
// ============================================================================

function generatePlanetTexture(colors, type, size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base color
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, `#${colors[0].toString(16).padStart(6, '0')}`);
    grad.addColorStop(0.5, `#${colors[1].toString(16).padStart(6, '0')}`);
    grad.addColorStop(1, `#${colors[2].toString(16).padStart(6, '0')}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Type-specific surface detail
    if (type === 'gas') {
        // Horizontal bands
        for (let i = 0; i < 20; i++) {
            const y = (i / 20) * size;
            const h = size / 20 * (0.5 + Math.random() * 0.8);
            const ci = Math.floor(Math.random() * colors.length);
            ctx.fillStyle = `#${colors[ci].toString(16).padStart(6, '0')}`;
            ctx.globalAlpha = 0.3 + Math.random() * 0.3;
            ctx.fillRect(0, y, size, h);
        }
        // Storm spots
        for (let i = 0; i < 5; i++) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = `#${colors[3].toString(16).padStart(6, '0')}`;
            const sx = Math.random() * size;
            const sy = Math.random() * size;
            ctx.beginPath();
            ctx.ellipse(sx, sy, 15 + Math.random() * 30, 8 + Math.random() * 15, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (type === 'molten') {
        // Lava cracks
        for (let i = 0; i < 200; i++) {
            ctx.globalAlpha = 0.3 + Math.random() * 0.5;
            ctx.strokeStyle = `#${colors[4].toString(16).padStart(6, '0')}`;
            ctx.lineWidth = 1 + Math.random() * 3;
            ctx.beginPath();
            let x = Math.random() * size;
            let y = Math.random() * size;
            ctx.moveTo(x, y);
            for (let j = 0; j < 5; j++) {
                x += (Math.random() - 0.5) * 40;
                y += (Math.random() - 0.5) * 40;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    } else if (type === 'terrestrial') {
        // Continents and oceans
        for (let i = 0; i < 12; i++) {
            ctx.globalAlpha = 0.5 + Math.random() * 0.3;
            const ci = Math.random() > 0.5 ? 0 : 4;
            ctx.fillStyle = `#${colors[ci].toString(16).padStart(6, '0')}`;
            ctx.beginPath();
            const cx = Math.random() * size;
            const cy = Math.random() * size;
            ctx.moveTo(cx, cy);
            for (let j = 0; j < 8; j++) {
                const a = (j / 8) * Math.PI * 2;
                const r = 20 + Math.random() * 60;
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
        }
        // Clouds
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 30; i++) {
            ctx.beginPath();
            ctx.ellipse(Math.random()*size, Math.random()*size, 10+Math.random()*40, 5+Math.random()*15, Math.random()*Math.PI, 0, Math.PI*2);
            ctx.fill();
        }
    } else if (type === 'ice') {
        // Ice cracks and ridges
        for (let i = 0; i < 100; i++) {
            ctx.globalAlpha = 0.2 + Math.random() * 0.3;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.5 + Math.random() * 2;
            ctx.beginPath();
            let x = Math.random() * size;
            let y = Math.random() * size;
            ctx.moveTo(x, y);
            for (let j = 0; j < 4; j++) {
                x += (Math.random() - 0.5) * 60;
                y += (Math.random() - 0.5) * 60;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    } else if (type === 'toxic') {
        // Swirling clouds
        for (let i = 0; i < 40; i++) {
            ctx.globalAlpha = 0.2 + Math.random() * 0.3;
            const ci = Math.floor(Math.random() * colors.length);
            ctx.fillStyle = `#${colors[ci].toString(16).padStart(6, '0')}`;
            ctx.beginPath();
            ctx.ellipse(Math.random()*size, Math.random()*size, 15+Math.random()*50, 10+Math.random()*25, Math.random()*Math.PI, 0, Math.PI*2);
            ctx.fill();
        }
    } else if (type === 'crystal') {
        // Faceted surface
        for (let i = 0; i < 60; i++) {
            ctx.globalAlpha = 0.3 + Math.random() * 0.4;
            const ci = Math.floor(Math.random() * colors.length);
            ctx.fillStyle = `#${colors[ci].toString(16).padStart(6, '0')}`;
            const cx = Math.random() * size;
            const cy = Math.random() * size;
            const sides = 3 + Math.floor(Math.random() * 4);
            const r = 5 + Math.random() * 30;
            ctx.beginPath();
            for (let j = 0; j <= sides; j++) {
                const a = (j / sides) * Math.PI * 2;
                const px = cx + Math.cos(a) * r;
                const py = cy + Math.sin(a) * r;
                j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
        }
        // Glowing lines
        for (let i = 0; i < 30; i++) {
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = '#dd99ff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(Math.random()*size, Math.random()*size);
            ctx.lineTo(Math.random()*size, Math.random()*size);
            ctx.stroke();
        }
    }

    ctx.globalAlpha = 1;
    return new THREE.CanvasTexture(canvas);
}

function generateBumpMap(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
        const v = Math.floor(Math.random() * 255);
        imageData.data[i] = v;
        imageData.data[i+1] = v;
        imageData.data[i+2] = v;
        imageData.data[i+3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
}

// ============================================================================
// Main Application
// ============================================================================

let scene, camera, renderer, composer, controls;
let planets = [];
let moons = [];
let debris = null;
let shockwaves = [];
let collisionOccurred = false;
let coalescencePhase = false;
let coalescenceProgress = 0;
let finalPlanet = null;
let paused = false;
let simTime = 0;
let frameCount = 0;
let lastFpsTime = performance.now();

// Debris physics arrays
let debrisPos, debrisVel, debrisLife, debrisColor, debrisMass;
let debrisActive = false;
let debrisCount = 0;

// FPV Mode state
let fpvMode = false;
let fpvPlanet = null; // which planet we're standing on
let fpvLat = 0; // latitude on planet surface (radians)
let fpvLon = 0; // longitude on planet surface (radians)
let fpvYaw = 0; // horizontal look angle
let fpvPitch = 0; // vertical look angle
let fpvMouseDown = false;
let fpvLastMouseX = 0;
let fpvLastMouseY = 0;
let fpvSavedCamPos = null;
let fpvSavedCamTarget = null;
let raycaster = null;
let fpvPointerLocked = false;

// Physics engine (university-level N-body computation)
let nBodyEngine = null;

// Stellar effects (beams, accretion disks, field lines)
let stellarEffects = [];
// Panoramic mode
let panoramicMode = false;
let panAngle = 0;
let panElevation = 0.3;
let panRadius = 80;
let panSavedCamPos = null;
let panSavedCamTarget = null;
let panSavedFov = 60;
// Free-floating ambient particles
let ambientParticles = null;
let ambientCount = 15000;

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000005, 0.003);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 30, 60);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 300;

    // Post-processing
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        CONFIG.bloomStrength, CONFIG.bloomRadius, CONFIG.bloomThreshold
    );
    composer.addPass(bloom);

    // Lighting
    const ambient = new THREE.AmbientLight(0x222233, 0.5);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
    sun.position.set(50, 30, 50);
    scene.add(sun);
    const fillLight = new THREE.DirectionalLight(0x4466aa, 0.5);
    fillLight.position.set(-30, -10, -30);
    scene.add(fillLight);

    // Background stars
    createBackgroundStars();

    // Initialize N-body physics engine (Yoshida 4th-order symplectic integrator)
    nBodyEngine = new NBodyEngine({
        G: CONFIG.G,
        softening: CONFIG.softening,
        dt: 0.016,
        integrator: 'yoshida4',
        adaptiveStep: true,
        etaParam: 0.02,
        restitution: 0.3,
        enableFragmentation: false, // we handle visual breakup ourselves
        trackConservation: true,
    });

    // Create planets
    createPlanets();

    // Pre-allocate debris arrays
    allocateDebris();

    // Ambient particles (interstellar dust/gas)
    createAmbientParticles();

    // UI
    setupUI();

    // FPV controls
    setupFPVControls();

    // Window resize
    window.addEventListener('resize', onResize);

    // Hide loading
    document.getElementById('loading').style.display = 'none';

    // Start
    animate();
}

function createBackgroundStars() {
    const geo = new THREE.BufferGeometry();
    const count = CONFIG.backgroundStars;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 300 + Math.random() * 500;
        pos[i*3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i*3+2] = r * Math.cos(phi);

        const temp = Math.random();
        col[i*3] = 0.7 + temp * 0.3;
        col[i*3+1] = 0.7 + temp * 0.2;
        col[i*3+2] = 0.8 + temp * 0.2;

        sizes[i] = 0.5 + Math.random() * 1.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
        vertexColors: true,
        size: 1.0,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.8,
    });

    scene.add(new THREE.Points(geo, mat));
}

function createPlanets() {
    // Pick a mix: 3-4 planets + 1-2 stellar objects
    const planetTypes = PLANET_TYPES.filter(p => !p.isStellar);
    const stellarTypes = PLANET_TYPES.filter(p => p.isStellar);
    const shuffledPlanets = [...planetTypes].sort(() => Math.random() - 0.5);
    const shuffledStellar = [...stellarTypes].sort(() => Math.random() - 0.5);
    const selected = [
        ...shuffledPlanets.slice(0, 3 + Math.floor(Math.random() * 2)),
        ...shuffledStellar.slice(0, 1 + Math.floor(Math.random() * 2)),
    ];

    // Arrange them on a collision course (up to 6 bodies)
    const arrangements = [
        { pos: new THREE.Vector3(-35, 5, -10), vel: new THREE.Vector3(4, -0.5, 1) },
        { pos: new THREE.Vector3(35, -5, 10), vel: new THREE.Vector3(-4, 0.5, -1) },
        { pos: new THREE.Vector3(0, 30, -20), vel: new THREE.Vector3(0.5, -3.5, 2) },
        { pos: new THREE.Vector3(5, -30, 15), vel: new THREE.Vector3(-0.5, 3, -1.5) },
        { pos: new THREE.Vector3(-25, -20, 25), vel: new THREE.Vector3(3, 2, -2) },
        { pos: new THREE.Vector3(20, 25, -25), vel: new THREE.Vector3(-2, -2.5, 1.5) },
    ];

    const bumpMap = generateBumpMap();

    selected.forEach((pType, i) => {
        const texture = generatePlanetTexture(pType.colors, pType.type);
        const geo = new THREE.SphereGeometry(pType.radius, 64, 48);
        const mat = new THREE.MeshStandardMaterial({
            map: texture,
            bumpMap: bumpMap,
            bumpScale: pType.bumpScale,
            emissive: new THREE.Color(pType.emissive),
            emissiveIntensity: pType.emissiveIntensity,
            roughness: 0.7,
            metalness: 0.2,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(arrangements[i].pos);
        scene.add(mesh);

        // Atmosphere glow
        const atmosGeo = new THREE.SphereGeometry(pType.radius * 1.08, 32, 24);
        const atmosMat = new THREE.MeshBasicMaterial({
            color: pType.colors[1],
            transparent: true,
            opacity: 0.12,
            side: THREE.BackSide,
        });
        const atmos = new THREE.Mesh(atmosGeo, atmosMat);
        mesh.add(atmos);

        // Rings for gas giant
        if (pType.hasRings) {
            const ringGeo = new THREE.RingGeometry(pType.radius * 1.4, pType.radius * 2.2, 64);
            const ringMat = new THREE.MeshBasicMaterial({
                color: pType.colors[3],
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI * 0.45;
            mesh.add(ring);
        }

        // Stellar object visual effects
        if (pType.isStellar) {
            createStellarEffects(mesh, pType);
        }

        const planet = {
            mesh,
            vel: arrangements[i].vel.clone(),
            mass: pType.mass,
            radius: pType.radius,
            type: pType,
            alive: true,
            isStellar: !!pType.isStellar,
            angularVel: pType.isStellar ? (5 + Math.random() * 15) : (Math.random() - 0.5) * 2,
            rotationAxis: new THREE.Vector3(
                Math.random() - 0.5,
                1,
                Math.random() - 0.5
            ).normalize(),
        };
        planets.push(planet);

        // Register with N-body engine
        const body = new Body({
            mass: pType.mass,
            radius: pType.radius,
            x: arrangements[i].pos.x,
            y: arrangements[i].pos.y,
            z: arrangements[i].pos.z,
            vx: arrangements[i].vel.x,
            vy: arrangements[i].vel.y,
            vz: arrangements[i].vel.z,
            id: `planet-${i}`,
            type: pType.type,
        });
        nBodyEngine.addBody(body);
        planet.bodyRef = body; // link for syncing

        // Create moons
        for (let m = 0; m < pType.moons; m++) {
            const moonGeo = new THREE.SphereGeometry(pType.moonRadius, 24, 16);
            const moonMat = new THREE.MeshStandardMaterial({
                color: pType.moonColor,
                bumpMap: bumpMap,
                bumpScale: 0.1,
                roughness: 0.8,
                metalness: 0.1,
            });
            const moonMesh = new THREE.Mesh(moonGeo, moonMat);
            scene.add(moonMesh);

            moons.push({
                mesh: moonMesh,
                parent: planet,
                orbitRadius: pType.moonOrbitRadius * (0.7 + m * 0.4),
                orbitSpeed: (1 + Math.random()) * (m % 2 === 0 ? 1 : -1),
                orbitAngle: Math.random() * Math.PI * 2,
                orbitTilt: (Math.random() - 0.5) * 0.5,
                alive: true,
                vel: new THREE.Vector3(),
                mass: pType.mass * 0.01,
                radius: pType.moonRadius,
                freed: false, // becomes true when parent is destroyed
            });
        }
    });
}

// ============================================================================
// Stellar Visual Effects
// ============================================================================

function createStellarEffects(mesh, pType) {
    const r = pType.radius;
    const effect = { mesh, type: pType.type, children: [] };

    // Core glow sphere (intense inner glow)
    const glowGeo = new THREE.SphereGeometry(r * 1.6, 24, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: pType.emissive,
        transparent: true,
        opacity: 0.25,
        side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    mesh.add(glow);
    effect.coreGlow = glow;

    // Outer halo
    const haloGeo = new THREE.SphereGeometry(r * 3, 16, 12);
    const haloMat = new THREE.MeshBasicMaterial({
        color: pType.emissive,
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    mesh.add(halo);
    effect.halo = halo;

    // Point light (stellar objects are luminous)
    const light = new THREE.PointLight(pType.emissive, 8, r * 40);
    mesh.add(light);
    effect.light = light;

    if (pType.type === 'pulsar') {
        // Twin jet beams along rotation axis
        const beamLen = r * 25;
        const beamGeo = new THREE.CylinderGeometry(r * 0.15, r * 0.6, beamLen, 8, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0x00ccff,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        const beam1 = new THREE.Mesh(beamGeo, beamMat);
        beam1.position.y = beamLen / 2;
        mesh.add(beam1);
        const beam2 = new THREE.Mesh(beamGeo, beamMat.clone());
        beam2.position.y = -beamLen / 2;
        beam2.rotation.x = Math.PI;
        mesh.add(beam2);
        effect.beams = [beam1, beam2];

        // Cone glow at beam tips
        const coneGeo = new THREE.ConeGeometry(r * 1.5, r * 4, 12, 1, true);
        const coneMat = new THREE.MeshBasicMaterial({
            color: 0x44eeff,
            transparent: true,
            opacity: 0.2,
        });
        const cone1 = new THREE.Mesh(coneGeo, coneMat);
        cone1.position.y = beamLen + r * 2;
        mesh.add(cone1);
        const cone2 = new THREE.Mesh(coneGeo, coneMat.clone());
        cone2.position.y = -(beamLen + r * 2);
        cone2.rotation.x = Math.PI;
        mesh.add(cone2);
        effect.cones = [cone1, cone2];
    }

    if (pType.type === 'magnetar') {
        // Magnetic field lines (torus loops at different angles)
        for (let fi = 0; fi < 4; fi++) {
            const torusGeo = new THREE.TorusGeometry(r * (3 + fi * 1.5), r * 0.08, 8, 48);
            const torusMat = new THREE.MeshBasicMaterial({
                color: 0xff44cc,
                transparent: true,
                opacity: 0.2 - fi * 0.03,
            });
            const torus = new THREE.Mesh(torusGeo, torusMat);
            torus.rotation.x = Math.PI / 2 + (fi * 0.3 - 0.45);
            torus.rotation.z = fi * 0.8;
            mesh.add(torus);
            effect.children.push(torus);
        }

        // Energy bursts (small sprite-like spheres orbiting)
        effect.bursts = [];
        for (let bi = 0; bi < 12; bi++) {
            const bGeo = new THREE.SphereGeometry(r * 0.2, 6, 6);
            const bMat = new THREE.MeshBasicMaterial({
                color: 0xff88ff,
                transparent: true,
                opacity: 0.6,
            });
            const burst = new THREE.Mesh(bGeo, bMat);
            mesh.add(burst);
            effect.bursts.push({
                mesh: burst,
                angle: (bi / 12) * Math.PI * 2,
                radius: r * (2.5 + Math.random() * 3),
                speed: 1.5 + Math.random() * 2,
                tilt: (Math.random() - 0.5) * Math.PI * 0.8,
                yOff: (Math.random() - 0.5) * r * 3,
            });
        }
    }

    if (pType.type === 'neutron') {
        // Accretion disk (flat ring of particles)
        const diskCount = 3000;
        const diskGeo = new THREE.BufferGeometry();
        const diskPos = new Float32Array(diskCount * 3);
        const diskCol = new Float32Array(diskCount * 3);
        const diskSizes = new Float32Array(diskCount);
        for (let di = 0; di < diskCount; di++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = r * 2 + Math.random() * r * 6;
            const spread = (Math.random() - 0.5) * r * 0.4;
            diskPos[di * 3] = Math.cos(angle) * dist;
            diskPos[di * 3 + 1] = spread;
            diskPos[di * 3 + 2] = Math.sin(angle) * dist;
            // Hot inner (white-blue) → cool outer (orange-red)
            const t = (dist - r * 2) / (r * 6);
            diskCol[di * 3] = 0.5 + (1 - t) * 0.5;
            diskCol[di * 3 + 1] = 0.6 + (1 - t) * 0.4 - t * 0.3;
            diskCol[di * 3 + 2] = 0.8 + (1 - t) * 0.2 - t * 0.6;
            diskSizes[di] = 0.2 + Math.random() * 0.4;
        }
        diskGeo.setAttribute('position', new THREE.BufferAttribute(diskPos, 3));
        diskGeo.setAttribute('color', new THREE.BufferAttribute(diskCol, 3));
        diskGeo.setAttribute('size', new THREE.BufferAttribute(diskSizes, 1));
        const diskMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 0.3,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.7,
        });
        const disk = new THREE.Points(diskGeo, diskMat);
        mesh.add(disk);
        effect.disk = disk;
        effect.diskCount = diskCount;
    }

    stellarEffects.push(effect);
}

function updateStellarEffects(dt) {
    for (const fx of stellarEffects) {
        if (!fx.mesh.parent) continue; // removed from scene

        // Pulsing core glow
        if (fx.coreGlow) {
            const pulse = 0.2 + Math.sin(simTime * (fx.type === 'pulsar' ? 20 : 5)) * 0.1;
            fx.coreGlow.material.opacity = pulse;
        }

        // Halo flicker
        if (fx.halo) {
            fx.halo.material.opacity = 0.05 + Math.sin(simTime * 3.3 + 1) * 0.03;
        }

        // Light pulsing
        if (fx.light) {
            fx.light.intensity = 6 + Math.sin(simTime * (fx.type === 'pulsar' ? 25 : 4)) * 3;
        }

        // Pulsar beam opacity oscillation (lighthouse effect done by mesh spin)
        if (fx.beams) {
            const beamPulse = 0.3 + Math.abs(Math.sin(simTime * 15)) * 0.4;
            fx.beams[0].material.opacity = beamPulse;
            fx.beams[1].material.opacity = beamPulse;
        }
        if (fx.cones) {
            const conePulse = 0.1 + Math.abs(Math.sin(simTime * 15)) * 0.2;
            fx.cones[0].material.opacity = conePulse;
            fx.cones[1].material.opacity = conePulse;
        }

        // Magnetar bursts orbit
        if (fx.bursts) {
            for (const b of fx.bursts) {
                b.angle += b.speed * dt;
                b.mesh.position.set(
                    Math.cos(b.angle) * b.radius,
                    b.yOff + Math.sin(b.angle * 0.7) * b.radius * 0.3,
                    Math.sin(b.angle) * b.radius
                );
                b.mesh.material.opacity = 0.3 + Math.sin(b.angle * 3) * 0.3;
            }
        }

        // Magnetar field lines wobble
        for (let ci = 0; ci < fx.children.length; ci++) {
            const child = fx.children[ci];
            child.rotation.y += dt * (0.3 + ci * 0.15);
        }

        // Neutron star accretion disk rotation
        if (fx.disk) {
            fx.disk.rotation.y += dt * 2.5;
        }
    }
}

// ============================================================================
// Ambient free-floating particles
// ============================================================================

function createAmbientParticles() {
    const count = ambientCount;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        // Spread across the simulation volume
        pos[i3] = (Math.random() - 0.5) * 200;
        pos[i3 + 1] = (Math.random() - 0.5) * 200;
        pos[i3 + 2] = (Math.random() - 0.5) * 200;

        // Slow random drift
        vel[i3] = (Math.random() - 0.5) * 0.5;
        vel[i3 + 1] = (Math.random() - 0.5) * 0.5;
        vel[i3 + 2] = (Math.random() - 0.5) * 0.5;

        // Warm interstellar dust colors
        const t = Math.random();
        if (t < 0.3) {
            // Blue-white (hot gas)
            col[i3] = 0.6 + Math.random() * 0.4;
            col[i3 + 1] = 0.7 + Math.random() * 0.3;
            col[i3 + 2] = 0.9 + Math.random() * 0.1;
        } else if (t < 0.6) {
            // Orange-red (warm dust)
            col[i3] = 0.8 + Math.random() * 0.2;
            col[i3 + 1] = 0.3 + Math.random() * 0.3;
            col[i3 + 2] = 0.1 + Math.random() * 0.15;
        } else {
            // Dim neutral (cold dust)
            const v = 0.3 + Math.random() * 0.3;
            col[i3] = v;
            col[i3 + 1] = v * 0.9;
            col[i3 + 2] = v * 1.1;
        }

        sizes[i] = 0.1 + Math.random() * 0.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
        vertexColors: true,
        size: 0.3,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.5,
    });

    ambientParticles = new THREE.Points(geo, mat);
    ambientParticles._vel = vel;
    scene.add(ambientParticles);
}

function updateAmbientParticles(dt) {
    if (!ambientParticles) return;
    const pos = ambientParticles.geometry.attributes.position.array;
    const vel = ambientParticles._vel;
    const activePlanets = planets.filter(p => p.alive);

    for (let i = 0; i < ambientCount; i++) {
        const i3 = i * 3;

        // Gravity from all alive planets/stellar objects
        for (const p of activePlanets) {
            const dx = p.mesh.position.x - pos[i3];
            const dy = p.mesh.position.y - pos[i3 + 1];
            const dz = p.mesh.position.z - pos[i3 + 2];
            const dist2 = dx * dx + dy * dy + dz * dz + 4;
            const dist = Math.sqrt(dist2);
            // Stellar objects have stronger gravity pull on particles
            const strength = CONFIG.G * p.mass * 0.0003 / dist2;
            vel[i3] += dx / dist * strength * dt;
            vel[i3 + 1] += dy / dist * strength * dt;
            vel[i3 + 2] += dz / dist * strength * dt;
        }

        // Damping to keep things stable
        vel[i3] *= 0.9995;
        vel[i3 + 1] *= 0.9995;
        vel[i3 + 2] *= 0.9995;

        pos[i3] += vel[i3] * dt;
        pos[i3 + 1] += vel[i3 + 1] * dt;
        pos[i3 + 2] += vel[i3 + 2] * dt;

        // Wrap particles that drift too far
        for (let k = 0; k < 3; k++) {
            if (pos[i3 + k] > 120) pos[i3 + k] = -120;
            if (pos[i3 + k] < -120) pos[i3 + k] = 120;
        }
    }

    ambientParticles.geometry.attributes.position.needsUpdate = true;
}

function allocateDebris() {
    const count = CONFIG.debrisCount;
    debrisPos = new Float32Array(count * 3);
    debrisVel = new Float32Array(count * 3);
    debrisLife = new Float32Array(count);
    debrisColor = new Float32Array(count * 3);
    debrisMass = new Float32Array(count);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(debrisPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(debrisColor, 3));

    const mat = new THREE.PointsMaterial({
        vertexColors: true,
        size: 0.2,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    debris = new THREE.Points(geo, mat);
    debris.visible = false;
    scene.add(debris);
}

function spawnDebris(posA, posB, velA, velB, typeA, typeB, totalMass) {
    const count = CONFIG.debrisCount;
    const midX = (posA.x + posB.x) * 0.5;
    const midY = (posA.y + posB.y) * 0.5;
    const midZ = (posA.z + posB.z) * 0.5;
    const avgVelX = (velA.x + velB.x) * 0.5;
    const avgVelY = (velA.y + velB.y) * 0.5;
    const avgVelZ = (velA.z + velB.z) * 0.5;

    const colorsA = typeA.colors;
    const colorsB = typeB.colors;

    // Impact velocity magnitude for scaling debris speed
    const impactSpeed = Math.sqrt(
        (velA.x - velB.x) ** 2 + (velA.y - velB.y) ** 2 + (velA.z - velB.z) ** 2
    );
    // Collision axis (direction between planets)
    const colAxisX = posB.x - posA.x, colAxisY = posB.y - posA.y, colAxisZ = posB.z - posA.z;
    const colAxisLen = Math.sqrt(colAxisX * colAxisX + colAxisY * colAxisY + colAxisZ * colAxisZ) + 0.01;
    const cax = colAxisX / colAxisLen, cay = colAxisY / colAxisLen, caz = colAxisZ / colAxisLen;

    const combinedRadius = typeA.radius + typeB.radius;

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // Spawn debris distributed along both planet volumes, not just the center
        const fromA = Math.random() > 0.5;
        const srcPos = fromA ? posA : posB;
        const srcR = fromA ? typeA.radius : typeB.radius;
        // Random position within planet volume
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const rDist = srcR * Math.cbrt(Math.random()); // cube root for uniform volume
        debrisPos[i3] = srcPos.x + Math.sin(phi) * Math.cos(theta) * rDist;
        debrisPos[i3+1] = srcPos.y + Math.sin(phi) * Math.sin(theta) * rDist;
        debrisPos[i3+2] = srcPos.z + Math.cos(phi) * rDist;

        // Velocity: mostly inherited momentum + mild random ejection
        // Fragments near the impact seam move faster; ones on the far side drift slowly
        const dx = debrisPos[i3] - midX;
        const dy = debrisPos[i3+1] - midY;
        const dz = debrisPos[i3+2] - midZ;
        const distFromImpact = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.01;
        const nearImpact = Math.max(0, 1 - distFromImpact / combinedRadius);

        // Eject along direction away from center, scaled by proximity to impact
        const ejectSpeed = (0.5 + nearImpact * 3) * (0.3 + impactSpeed * 0.15);
        const ex = dx / distFromImpact;
        const ey = dy / distFromImpact;
        const ez = dz / distFromImpact;

        // Inherit parent velocity
        const srcVel = fromA ? velA : velB;
        debrisVel[i3] = srcVel.x * 0.8 + ex * ejectSpeed + (Math.random() - 0.5) * 1.5;
        debrisVel[i3+1] = srcVel.y * 0.8 + ey * ejectSpeed + (Math.random() - 0.5) * 1.5;
        debrisVel[i3+2] = srcVel.z * 0.8 + ez * ejectSpeed + (Math.random() - 0.5) * 1.5;

        // Stagger spawn: some debris "activates" later (delayed breakup)
        // Life > 1.0 means it hasn't appeared yet (countdown)
        const delay = Math.random() * Math.random() * 2.0; // most spawn quickly, some delayed
        debrisLife[i] = 1.0 + delay;

        debrisMass[i] = totalMass / count;

        // Color from source planet (not random mix)
        const c = fromA ? colorsA : colorsB;
        const ci = Math.floor(Math.random() * c.length);
        const col = new THREE.Color(c[ci]);
        // Subtle heat glow only near the impact seam
        if (nearImpact > 0.6) {
            col.lerp(new THREE.Color(0xff6633), (nearImpact - 0.6) * 0.5);
        }
        debrisColor[i3] = col.r;
        debrisColor[i3+1] = col.g;
        debrisColor[i3+2] = col.b;
    }

    debris.geometry.attributes.position.needsUpdate = true;
    debris.geometry.attributes.color.needsUpdate = true;
    debris.visible = true;
    debrisActive = true;
    debrisCount = count;
}

function createImpactEffects(position, radiusA, radiusB) {
    // Subtle dust/debris cloud that expands slowly - no bright flash
    const combinedR = radiusA + radiusB;

    // Expanding dust ring along the collision plane
    const ringGeo = new THREE.RingGeometry(combinedR * 0.3, combinedR * 0.6, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x886644,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(position);
    ring.lookAt(camera.position);
    scene.add(ring);
    shockwaves.push({ mesh: ring, scale: 1, opacity: 0.35, isDust: true });

    // A second ring on perpendicular plane
    const ring2Geo = new THREE.RingGeometry(combinedR * 0.2, combinedR * 0.5, 32);
    const ring2 = new THREE.Mesh(ring2Geo, ringMat.clone());
    ring2.position.copy(position);
    ring2.rotation.x = Math.PI / 2;
    scene.add(ring2);
    shockwaves.push({ mesh: ring2, scale: 1, opacity: 0.3, isDust: true });

    // Warm glow at impact point (not a flash, a slow burn)
    const glowGeo = new THREE.SphereGeometry(combinedR * 0.4, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff6633,
        transparent: true,
        opacity: 0.4,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(position);
    scene.add(glow);
    shockwaves.push({ mesh: glow, scale: 1, opacity: 0.4, isGlow: true });
}

// ============================================================================
// Physics
// ============================================================================

function updatePhysics(dt) {
    if (coalescencePhase) {
        updateCoalescence(dt);
        return;
    }

    const activePlanets = planets.filter(p => p.alive);

    // --- N-Body Engine Integration (Yoshida 4th-order symplectic) ---
    // Sync engine G in case user changed the slider
    nBodyEngine.G = CONFIG.G;

    // Step the integrator only (no internal collision resolution - we handle visuals ourselves)
    const intactBodies = activePlanets.filter(p => !p.breaking && p.bodyRef);
    if (intactBodies.length > 0) {
        const stepDt = nBodyEngine.adaptiveStep ? nBodyEngine.computeAdaptiveDt() : dt;
        nBodyEngine.stepYoshida4(stepDt);
        nBodyEngine.time += stepDt;
        nBodyEngine.stepCount++;
        if (nBodyEngine.stepCount % 10 === 0) {
            nBodyEngine.updateConservationDiagnostics();
        }
    }

    // Sync engine state back to Three.js meshes
    for (const p of activePlanets) {
        if (!p.bodyRef) continue;
        const b = p.bodyRef;

        if (!p.breaking) {
            // Read positions/velocities from engine
            p.mesh.position.set(b.x, b.y, b.z);
            p.vel.set(b.vx, b.vy, b.vz);
        } else {
            // Breaking planets: push our position back to engine (visual drives physics)
            b.x = p.mesh.position.x;
            b.y = p.mesh.position.y;
            b.z = p.mesh.position.z;
            b.vx = p.vel.x;
            b.vy = p.vel.y;
            b.vz = p.vel.z;
            // Still move breaking planets
            p.mesh.position.x += p.vel.x * dt;
            p.mesh.position.y += p.vel.y * dt;
            p.mesh.position.z += p.vel.z * dt;
        }

        // Rotation (breaking planets spin faster)
        const spinMult = p.breaking ? 1 + p.breakProgress * 3 : 1;
        p.mesh.rotateOnAxis(p.rotationAxis, p.angularVel * spinMult * dt);
    }

    // Collision detection using engine (contact distance overlap)
    const { collisions } = nBodyEngine.detectCollisions();
    for (const [bi, bj, dist] of collisions) {
        // Find matching planet objects
        const a = activePlanets.find(p => p.bodyRef === bi);
        const b = activePlanets.find(p => p.bodyRef === bj);
        if (a && b && !a.breaking && !b.breaking) {
            handleCollision(a, b);
            // Remove collided bodies from engine (visual breakup system takes over)
            nBodyEngine.removeBody(bi);
            nBodyEngine.removeBody(bj);
            a.bodyRef = null;
            b.bodyRef = null;
        }
    }

    // Update moons
    for (const moon of moons) {
        if (!moon.alive) continue;

        if (!moon.freed && moon.parent.alive) {
            // Orbit parent
            moon.orbitAngle += moon.orbitSpeed * dt;
            const pp = moon.parent.mesh.position;
            moon.mesh.position.x = pp.x + Math.cos(moon.orbitAngle) * moon.orbitRadius;
            moon.mesh.position.y = pp.y + Math.sin(moon.orbitTilt) * Math.sin(moon.orbitAngle) * moon.orbitRadius;
            moon.mesh.position.z = pp.z + Math.sin(moon.orbitAngle) * moon.orbitRadius;
        } else if (!moon.freed && !moon.parent.alive) {
            // Parent destroyed - free the moon
            moon.freed = true;
            moon.vel.copy(moon.parent.vel);
            // Add orbital velocity
            const tangent = new THREE.Vector3(
                -Math.sin(moon.orbitAngle),
                0,
                Math.cos(moon.orbitAngle)
            ).multiplyScalar(moon.orbitSpeed * moon.orbitRadius * 0.3);
            moon.vel.add(tangent);
        }

        if (moon.freed) {
            // Apply gravity from remaining planets
            for (const p of activePlanets) {
                const dx = p.mesh.position.x - moon.mesh.position.x;
                const dy = p.mesh.position.y - moon.mesh.position.y;
                const dz = p.mesh.position.z - moon.mesh.position.z;
                const dist2 = dx*dx + dy*dy + dz*dz + CONFIG.softening;
                const dist = Math.sqrt(dist2);
                const F = CONFIG.G * p.mass * moon.mass / dist2;
                moon.vel.x += F * dx / (dist * moon.mass) * dt;
                moon.vel.y += F * dy / (dist * moon.mass) * dt;
                moon.vel.z += F * dz / (dist * moon.mass) * dt;
            }
            moon.mesh.position.x += moon.vel.x * dt;
            moon.mesh.position.y += moon.vel.y * dt;
            moon.mesh.position.z += moon.vel.z * dt;
        }
    }

    // Update debris
    if (debrisActive) {
        updateDebris(dt, activePlanets);
    }
}

// Collision state for gradual breakup
let breakingPlanets = []; // planets mid-breakup
let collisionChunks = []; // large rock chunks

function handleCollision(a, b) {
    collisionOccurred = true;

    const mid = a.mesh.position.clone().add(b.mesh.position).multiplyScalar(0.5);

    // Subtle impact effects (dust cloud + warm glow, no nuke flash)
    createImpactEffects(mid, a.radius, b.radius);

    // Spawn debris from both planets
    spawnDebris(
        a.mesh.position, b.mesh.position,
        a.vel, b.vel,
        a.type, b.type,
        a.mass + b.mass
    );

    // Spawn large chunks (mesh fragments that drift and tumble)
    spawnChunks(a, b);

    // Start gradual breakup: planets don't vanish instantly
    // They deform (squash), glow at impact seam, then fade/shrink over time
    a.breaking = true;
    a.breakProgress = 0;
    b.breaking = true;
    b.breakProgress = 0;

    // Squash direction is along the collision axis
    const collisionDir = b.mesh.position.clone().sub(a.mesh.position).normalize();
    a.breakAxis = collisionDir.clone();
    b.breakAxis = collisionDir.clone().negate();

    // Add impact seam glow to both planets
    addImpactGlow(a, collisionDir);
    addImpactGlow(b, collisionDir.clone().negate());

    // Slow them down (inelastic collision absorbs energy)
    const totalMass = a.mass + b.mass;
    const mergedVx = (a.vel.x * a.mass + b.vel.x * b.mass) / totalMass;
    const mergedVy = (a.vel.y * a.mass + b.vel.y * b.mass) / totalMass;
    const mergedVz = (a.vel.z * a.mass + b.vel.z * b.mass) / totalMass;
    // Push apart slightly
    a.vel.set(mergedVx - collisionDir.x * 0.5, mergedVy - collisionDir.y * 0.5, mergedVz - collisionDir.z * 0.5);
    b.vel.set(mergedVx + collisionDir.x * 0.5, mergedVy + collisionDir.y * 0.5, mergedVz + collisionDir.z * 0.5);

    breakingPlanets.push(a, b);
}

function addImpactGlow(planet, dir) {
    // Add a glowing hemisphere on the impact side
    const glowGeo = new THREE.SphereGeometry(planet.radius * 1.02, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff5522,
        transparent: true,
        opacity: 0.5,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    // Orient hemisphere toward impact direction
    glow.lookAt(dir);
    planet.mesh.add(glow);
    planet.impactGlow = glow;
}

function spawnChunks(a, b) {
    const chunkCount = 6 + Math.floor(Math.random() * 6);
    const mid = a.mesh.position.clone().add(b.mesh.position).multiplyScalar(0.5);

    for (let i = 0; i < chunkCount; i++) {
        const fromA = Math.random() > 0.5;
        const srcPlanet = fromA ? a : b;
        const srcR = srcPlanet.radius;

        // Chunk size proportional to planet
        const chunkScale = srcR * (0.15 + Math.random() * 0.35);
        const geoType = Math.random();
        const geo = geoType < 0.4 ? new THREE.DodecahedronGeometry(chunkScale, 0) :
                    geoType < 0.7 ? new THREE.OctahedronGeometry(chunkScale, 0) :
                    new THREE.TetrahedronGeometry(chunkScale, 0);

        const ci = Math.floor(Math.random() * srcPlanet.type.colors.length);
        const col = new THREE.Color(srcPlanet.type.colors[ci]);
        // Darken chunks slightly
        col.multiplyScalar(0.7 + Math.random() * 0.3);

        const mat = new THREE.MeshStandardMaterial({
            color: col,
            emissive: new THREE.Color(0xff4400),
            emissiveIntensity: 0.15 + Math.random() * 0.25,
            roughness: 0.85,
            metalness: 0.1,
            flatShading: true,
        });

        const chunk = new THREE.Mesh(geo, mat);
        // Spawn from planet surface
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        chunk.position.set(
            srcPlanet.mesh.position.x + Math.sin(phi) * Math.cos(theta) * srcR * 0.8,
            srcPlanet.mesh.position.y + Math.sin(phi) * Math.sin(theta) * srcR * 0.8,
            srcPlanet.mesh.position.z + Math.cos(phi) * srcR * 0.8,
        );
        chunk.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        scene.add(chunk);

        // Velocity: inherit planet + mild outward + random tumble
        const outDir = chunk.position.clone().sub(mid).normalize();
        const speed = 0.5 + Math.random() * 2;
        collisionChunks.push({
            mesh: chunk,
            vel: new THREE.Vector3(
                srcPlanet.vel.x * 0.6 + outDir.x * speed + (Math.random() - 0.5) * 0.8,
                srcPlanet.vel.y * 0.6 + outDir.y * speed + (Math.random() - 0.5) * 0.8,
                srcPlanet.vel.z * 0.6 + outDir.z * speed + (Math.random() - 0.5) * 0.8,
            ),
            angVel: new THREE.Vector3(
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3,
            ),
            life: 1.0,
            coolRate: 0.01 + Math.random() * 0.02,
        });
    }
}

function startCoalescence(center, planetA, planetB) {
    coalescencePhase = true;
    coalescenceProgress = 0;

    // Create the final merged planet (hidden initially)
    const combinedMass = planetA.mass + planetB.mass;
    const combinedRadius = Math.cbrt(Math.pow(planetA.radius, 3) + Math.pow(planetB.radius, 3));

    // Merge colors from both planets
    const mergedColors = [...planetA.type.colors.slice(0, 3), ...planetB.type.colors.slice(0, 2)];
    const texture = generatePlanetTexture(mergedColors, 'molten', 1024);
    const bumpMap = generateBumpMap(1024);

    const geo = new THREE.SphereGeometry(combinedRadius, 96, 64);
    const mat = new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap: bumpMap,
        bumpScale: 0.4,
        emissive: new THREE.Color(0xff4400),
        emissiveIntensity: 1.0,
        roughness: 0.5,
        metalness: 0.3,
    });

    finalPlanet = new THREE.Mesh(geo, mat);
    finalPlanet.position.copy(center);
    finalPlanet.scale.setScalar(0.01);

    // Atmosphere
    const atmosGeo = new THREE.SphereGeometry(combinedRadius * 1.15, 32, 24);
    const atmosMat = new THREE.MeshBasicMaterial({
        color: 0xff6644,
        transparent: true,
        opacity: 0.2,
        side: THREE.BackSide,
    });
    finalPlanet.add(new THREE.Mesh(atmosGeo, atmosMat));

    scene.add(finalPlanet);
}

function updateCoalescence(dt) {
    coalescenceProgress += CONFIG.coalescenceRate * dt * 60;

    if (coalescenceProgress > 1) coalescenceProgress = 1;

    // Grow the final planet
    const scale = coalescenceProgress;
    if (finalPlanet) {
        finalPlanet.scale.setScalar(scale);
        finalPlanet.rotation.y += dt * 0.5;

        // Reduce emissive as it cools
        if (coalescenceProgress > 0.5) {
            const cool = (coalescenceProgress - 0.5) * 2;
            finalPlanet.material.emissiveIntensity = 1.0 - cool * 0.8;
        }
    }

    // Pull debris toward center
    if (debrisActive) {
        const cx = finalPlanet ? finalPlanet.position.x : 0;
        const cy = finalPlanet ? finalPlanet.position.y : 0;
        const cz = finalPlanet ? finalPlanet.position.z : 0;

        let aliveCount = 0;
        const pullStrength = 2 + coalescenceProgress * 15;

        for (let i = 0; i < debrisCount; i++) {
            if (debrisLife[i] <= 0) continue;

            const i3 = i * 3;
            const dx = cx - debrisPos[i3];
            const dy = cy - debrisPos[i3+1];
            const dz = cz - debrisPos[i3+2];
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;

            // Attract toward center
            debrisVel[i3] += dx / dist * pullStrength * dt;
            debrisVel[i3+1] += dy / dist * pullStrength * dt;
            debrisVel[i3+2] += dz / dist * pullStrength * dt;

            // Damping
            debrisVel[i3] *= 0.999;
            debrisVel[i3+1] *= 0.999;
            debrisVel[i3+2] *= 0.999;

            debrisPos[i3] += debrisVel[i3] * dt;
            debrisPos[i3+1] += debrisVel[i3+1] * dt;
            debrisPos[i3+2] += debrisVel[i3+2] * dt;

            // Kill debris that reaches the planet
            if (dist < (finalPlanet ? finalPlanet.scale.x * 3.5 : 2)) {
                debrisLife[i] -= dt * 2;
            }

            if (debrisLife[i] > 0) aliveCount++;
        }

        debris.geometry.attributes.position.needsUpdate = true;

        // Fade out consumed debris
        for (let i = 0; i < debrisCount; i++) {
            if (debrisLife[i] <= 0) {
                debrisPos[i*3] = 99999;
                debrisPos[i*3+1] = 99999;
                debrisPos[i*3+2] = 99999;
            }
        }

        if (aliveCount === 0) {
            debrisActive = false;
            debris.visible = false;
        }
    }
}

function updateDebris(dt, activePlanets) {
    let aliveCount = 0;

    for (let i = 0; i < debrisCount; i++) {
        if (debrisLife[i] <= 0) continue;

        const i3 = i * 3;

        // Staggered spawn: life > 1.0 means counting down to activation
        if (debrisLife[i] > 1.0) {
            debrisLife[i] -= dt;
            // Hide off-screen until active
            debrisPos[i3] = 99999;
            debrisPos[i3+1] = 99999;
            debrisPos[i3+2] = 99999;
            aliveCount++;
            continue;
        }

        aliveCount++;

        // Gravity from ALL surviving planets (debris interacts with remaining bodies)
        for (const p of activePlanets) {
            if (p.breaking) continue; // skip planets mid-breakup
            const dx = p.mesh.position.x - debrisPos[i3];
            const dy = p.mesh.position.y - debrisPos[i3+1];
            const dz = p.mesh.position.z - debrisPos[i3+2];
            const dist2 = dx*dx + dy*dy + dz*dz + 1;
            const dist = Math.sqrt(dist2);
            const F = CONFIG.G * p.mass / dist2;
            debrisVel[i3] += F * dx / dist * dt;
            debrisVel[i3+1] += F * dy / dist * dt;
            debrisVel[i3+2] += F * dz / dist * dt;

            // Debris captured by a planet (close approach)
            if (dist < p.radius * 1.2) {
                debrisLife[i] -= dt * 0.5; // absorbed faster near planets
            }
        }

        // Gravity from collision chunks too
        for (const ch of collisionChunks) {
            const dx = ch.mesh.position.x - debrisPos[i3];
            const dy = ch.mesh.position.y - debrisPos[i3+1];
            const dz = ch.mesh.position.z - debrisPos[i3+2];
            const dist2 = dx*dx + dy*dy + dz*dz + 0.5;
            if (dist2 < 100) {
                const dist = Math.sqrt(dist2);
                const F = CONFIG.G * 2 / dist2;
                debrisVel[i3] += F * dx / dist * dt;
                debrisVel[i3+1] += F * dy / dist * dt;
                debrisVel[i3+2] += F * dz / dist * dt;
            }
        }

        // Sparse particle-particle interaction
        if (i % 80 === frameCount % 80) {
            for (let j = i + 1; j < Math.min(i + 150, debrisCount); j++) {
                if (debrisLife[j] <= 0 || debrisLife[j] > 1.0) continue;
                const j3 = j * 3;
                const dx = debrisPos[j3] - debrisPos[i3];
                const dy = debrisPos[j3+1] - debrisPos[i3+1];
                const dz = debrisPos[j3+2] - debrisPos[i3+2];
                const dist2 = dx*dx + dy*dy + dz*dz + 0.5;
                if (dist2 < 25) {
                    const dist = Math.sqrt(dist2);
                    const F = CONFIG.G * 0.01 / dist2;
                    debrisVel[i3] += F * dx / dist * dt;
                    debrisVel[i3+1] += F * dy / dist * dt;
                    debrisVel[i3+2] += F * dz / dist * dt;
                }
            }
        }

        debrisPos[i3] += debrisVel[i3] * dt;
        debrisPos[i3+1] += debrisVel[i3+1] * dt;
        debrisPos[i3+2] += debrisVel[i3+2] * dt;

        // Very slow fade (long-lived debris field)
        debrisLife[i] -= dt * 0.005;

        // Gradual color cooling (warm orange → natural color over time)
        const coolRate = dt * 0.008;
        if (debrisColor[i3] > 0.2) debrisColor[i3] -= coolRate;
    }

    debris.geometry.attributes.position.needsUpdate = true;
    debris.geometry.attributes.color.needsUpdate = true;
}

// ============================================================================
// Shockwave update
// ============================================================================

function updateShockwaves(dt) {
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        if (sw.isDust) {
            // Slow expanding dust cloud
            sw.scale += dt * 8;
            sw.opacity -= dt * 0.15;
            sw.mesh.scale.setScalar(sw.scale);
        } else if (sw.isGlow) {
            // Warm glow that slowly fades over time (slow burn)
            sw.scale += dt * 1.5;
            sw.opacity -= dt * 0.05;
            sw.mesh.scale.setScalar(sw.scale);
        } else {
            sw.scale += dt * 5;
            sw.opacity -= dt * 0.3;
            sw.mesh.scale.setScalar(sw.scale);
        }
        sw.mesh.material.opacity = Math.max(0, sw.opacity);

        if (sw.opacity <= 0) {
            scene.remove(sw.mesh);
            shockwaves.splice(i, 1);
        }
    }

    // Update breaking planets (gradual deformation and fade)
    for (let i = breakingPlanets.length - 1; i >= 0; i--) {
        const p = breakingPlanets[i];
        if (!p.breaking) { breakingPlanets.splice(i, 1); continue; }

        p.breakProgress += dt * 0.3; // slow breakup over ~3 seconds

        // Squash along collision axis, stretch perpendicular
        const squash = 1 - p.breakProgress * 0.5;
        const stretch = 1 + p.breakProgress * 0.3;
        p.mesh.scale.set(
            stretch,
            stretch,
            Math.max(0.1, squash)
        );
        // Orient squash toward collision axis
        p.mesh.lookAt(
            p.mesh.position.x + p.breakAxis.x,
            p.mesh.position.y + p.breakAxis.y,
            p.mesh.position.z + p.breakAxis.z
        );

        // Fade impact glow (slow burn, not flash)
        if (p.impactGlow) {
            p.impactGlow.material.opacity = Math.max(0, 0.5 - p.breakProgress * 0.15);
            // Color shifts from orange to deep red as it cools
            const coolT = Math.min(1, p.breakProgress * 0.4);
            p.impactGlow.material.color.setRGB(1 - coolT * 0.3, 0.3 - coolT * 0.2, 0.1 - coolT * 0.05);
        }

        // Shrink and fade the planet itself
        if (p.breakProgress > 0.5) {
            const fadeT = (p.breakProgress - 0.5) * 2;
            p.mesh.material.opacity = 1 - fadeT;
            p.mesh.material.transparent = true;
        }

        // Finally remove when fully broken
        if (p.breakProgress >= 1.0) {
            p.alive = false;
            p.breaking = false;
            scene.remove(p.mesh);
            breakingPlanets.splice(i, 1);

            // Check for coalescence trigger
            const remaining = planets.filter(pl => pl.alive && !pl.breaking);
            if (remaining.length === 0) {
                const mid = p.mesh.position.clone();
                const otherBroken = planets.find(pl => pl !== p && pl.breaking === false && !pl.alive);
                if (otherBroken) {
                    setTimeout(() => startCoalescence(mid, p, otherBroken), 4000);
                }
            }
        }
    }

    // Update chunks (tumbling rock fragments)
    for (let i = collisionChunks.length - 1; i >= 0; i--) {
        const ch = collisionChunks[i];
        ch.mesh.position.x += ch.vel.x * dt;
        ch.mesh.position.y += ch.vel.y * dt;
        ch.mesh.position.z += ch.vel.z * dt;
        ch.mesh.rotation.x += ch.angVel.x * dt;
        ch.mesh.rotation.y += ch.angVel.y * dt;
        ch.mesh.rotation.z += ch.angVel.z * dt;

        // Slow emissive cooling
        ch.mesh.material.emissiveIntensity = Math.max(0, ch.mesh.material.emissiveIntensity - ch.coolRate * dt);

        // Gravity from surviving planets
        for (const p of planets) {
            if (!p.alive || p.breaking) continue;
            const dx = p.mesh.position.x - ch.mesh.position.x;
            const dy = p.mesh.position.y - ch.mesh.position.y;
            const dz = p.mesh.position.z - ch.mesh.position.z;
            const dist2 = dx*dx + dy*dy + dz*dz + 1;
            const dist = Math.sqrt(dist2);
            const F = CONFIG.G * p.mass * 0.5 / dist2;
            ch.vel.x += F * dx / dist * dt;
            ch.vel.y += F * dy / dist * dt;
            ch.vel.z += F * dz / dist * dt;
        }

        ch.life -= dt * 0.03;
        if (ch.life <= 0) {
            scene.remove(ch.mesh);
            ch.mesh.geometry.dispose();
            ch.mesh.material.dispose();
            collisionChunks.splice(i, 1);
        }
    }
}

// ============================================================================
// UI
// ============================================================================

function setupUI() {
    document.getElementById('btn-pause').addEventListener('click', () => {
        paused = !paused;
        document.getElementById('btn-pause').textContent = paused ? 'Resume' : 'Pause';
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        resetSimulation();
    });

    document.getElementById('btn-collision').addEventListener('click', () => {
        // Boost planets toward center for faster collision
        planets.forEach(p => {
            if (!p.alive) return;
            const dir = p.mesh.position.clone().negate().normalize();
            p.vel.add(dir.multiplyScalar(8));
            // Sync boost to engine
            if (p.bodyRef) {
                p.bodyRef.vx = p.vel.x;
                p.bodyRef.vy = p.vel.y;
                p.bodyRef.vz = p.vel.z;
            }
        });
    });

    document.getElementById('btn-fpv').addEventListener('click', () => {
        if (fpvMode) {
            exitFPV();
            return;
        }
        // Enter picking mode - user clicks a planet to land on (no stellar objects)
        const alive = planets.filter(p => p.alive && !p.isStellar);
        if (alive.length === 0) return;
        // Auto-land on first alive planet, or enable picking
        if (alive.length === 1) {
            enterFPV(alive[0]);
        } else {
            fpvPickingMode = true;
            document.getElementById('fpv-info').style.display = 'flex';
            document.getElementById('fpv-info').querySelector('span').textContent = 'Click a planet to land on it';
        }
    });

    document.getElementById('btn-panoramic').addEventListener('click', () => {
        if (panoramicMode) {
            exitPanoramic();
        } else {
            enterPanoramic();
        }
    });

    document.getElementById('time-scale').addEventListener('input', (e) => {
        CONFIG.timeScale = e.target.value / 100 * 2;
    });

    document.getElementById('galaxy-size').addEventListener('input', (e) => {
        // Repurpose as "explosion intensity"
        CONFIG.G = 20 + (e.target.value / 100) * 60;
    });

    // Update labels
    const labels = document.querySelectorAll('label');
    labels.forEach(l => {
        if (l.textContent === 'Galaxy Size:') l.textContent = 'Gravity:';
    });
}

function resetSimulation() {
    // Remove all existing objects
    planets.forEach(p => { if (p.mesh.parent) scene.remove(p.mesh); });
    moons.forEach(m => { if (m.mesh.parent) scene.remove(m.mesh); });
    if (finalPlanet && finalPlanet.parent) scene.remove(finalPlanet);
    shockwaves.forEach(sw => scene.remove(sw.mesh));

    // Clean up stellar effects
    stellarEffects = [];
    // Clean up ambient particles
    if (ambientParticles && ambientParticles.parent) scene.remove(ambientParticles);
    ambientParticles = null;

    planets = [];
    moons = [];
    shockwaves = [];
    collisionOccurred = false;

    // Reset physics engine
    nBodyEngine = new NBodyEngine({
        G: CONFIG.G,
        softening: CONFIG.softening,
        dt: 0.016,
        integrator: 'yoshida4',
        adaptiveStep: true,
        etaParam: 0.02,
        restitution: 0.3,
        enableFragmentation: false,
        trackConservation: true,
    });
    coalescencePhase = false;
    coalescenceProgress = 0;
    finalPlanet = null;
    debrisActive = false;
    if (debris) debris.visible = false;
    simTime = 0;

    createPlanets();
    createAmbientParticles();
    document.getElementById('particle-count').textContent = planets.length + ' bodies';
}

// ============================================================================
// Animation loop
// ============================================================================

function animate() {
    requestAnimationFrame(animate);

    if (!paused) {
        const dt = 0.016 * CONFIG.timeScale;
        simTime += dt;
        updatePhysics(dt);
        updateShockwaves(dt);
        updateStellarEffects(dt);
        updateAmbientParticles(dt);
    }

    if (panoramicMode) {
        updatePanoramic(0.016 * CONFIG.timeScale);
    } else if (fpvMode) {
        updateFPV();
    } else {
        controls.update();
    }
    composer.render();

    // FPS counter
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime > 500) {
        const fps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        document.getElementById('fps').textContent = fps;
        const diag = nBodyEngine.getDiagnostics();
        document.getElementById('sim-time').textContent = `${simTime.toFixed(2)} | ΔE/E₀: ${diag.energyError.toExponential(2)} | ${diag.integrator}`;
        frameCount = 0;
        lastFpsTime = now;
    }

    // Update particle count display
    const aliveBodies = planets.filter(p => p.alive);
    const alivePlanetsCount = aliveBodies.filter(p => !p.isStellar).length;
    const aliveStellarCount = aliveBodies.filter(p => p.isStellar).length;
    const aliveMoons = moons.filter(m => m.alive).length;
    let status = `${alivePlanetsCount} planets`;
    if (aliveStellarCount > 0) status += `, ${aliveStellarCount} stellar`;
    status += `, ${aliveMoons} moons, ${ambientCount.toLocaleString()} particles`;
    if (debrisActive) status += `, ${CONFIG.debrisCount.toLocaleString()} debris`;
    if (coalescencePhase) status += ' [COALESCING]';
    document.getElementById('particle-count').textContent = status;
}

// ============================================================================
// Panoramic Mode - cinematic auto-orbit with wide FOV
// ============================================================================

function enterPanoramic() {
    if (fpvMode) exitFPV();
    panoramicMode = true;
    panSavedCamPos = camera.position.clone();
    panSavedCamTarget = controls.target.clone();
    panSavedFov = camera.fov;
    controls.enabled = false;

    // Start angle from current camera position
    panAngle = Math.atan2(camera.position.x, camera.position.z);
    panElevation = 0.3;
    panRadius = 80;

    // Widen FOV for cinematic panoramic look
    camera.fov = 100;
    camera.updateProjectionMatrix();

    document.getElementById('btn-panoramic').textContent = 'Exit Panoramic';
    document.getElementById('btn-panoramic').style.background = 'rgba(255, 170, 50, 0.4)';
    document.getElementById('btn-panoramic').style.borderColor = 'rgba(255, 170, 50, 0.7)';
}

function exitPanoramic() {
    panoramicMode = false;
    controls.enabled = true;

    // Restore camera
    camera.position.copy(panSavedCamPos);
    controls.target.copy(panSavedCamTarget);
    camera.fov = panSavedFov;
    camera.updateProjectionMatrix();

    document.getElementById('btn-panoramic').textContent = 'Panoramic';
    document.getElementById('btn-panoramic').style.background = '';
    document.getElementById('btn-panoramic').style.borderColor = '';
}

function updatePanoramic(dt) {
    if (!panoramicMode) return;

    // Compute center of mass of all alive bodies
    let cx = 0, cy = 0, cz = 0, totalMass = 0;
    for (const p of planets) {
        if (!p.alive) continue;
        cx += p.mesh.position.x * p.mass;
        cy += p.mesh.position.y * p.mass;
        cz += p.mesh.position.z * p.mass;
        totalMass += p.mass;
    }
    if (totalMass > 0) {
        cx /= totalMass;
        cy /= totalMass;
        cz /= totalMass;
    }

    // Slow orbit around center of mass
    panAngle += dt * 0.15;

    // Gentle elevation oscillation (sweeps up and down)
    panElevation = 0.25 + Math.sin(simTime * 0.08) * 0.35;

    // Slow radius breathing (dolly in/out)
    const baseRadius = 70;
    panRadius = baseRadius + Math.sin(simTime * 0.05) * 25;

    // If collision happened, pull in closer temporarily
    if (collisionOccurred && debrisActive) {
        panRadius = Math.min(panRadius, 45 + Math.sin(simTime * 0.1) * 10);
    }

    // Camera position on orbit
    const camX = cx + Math.sin(panAngle) * panRadius * Math.cos(panElevation);
    const camY = cy + Math.sin(panElevation) * panRadius * 0.6 + 10;
    const camZ = cz + Math.cos(panAngle) * panRadius * Math.cos(panElevation);

    // Smooth lerp to target position
    camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.02);

    // Look at center of mass with slight lead (look slightly ahead of orbit)
    const lookAhead = 0.3;
    const lx = cx + Math.sin(panAngle + lookAhead) * 5;
    const lz = cz + Math.cos(panAngle + lookAhead) * 5;
    const lookTarget = new THREE.Vector3(lx, cy, lz);

    // Smooth look-at
    const currentLook = new THREE.Vector3();
    camera.getWorldDirection(currentLook);
    const desiredLook = lookTarget.clone().sub(camera.position).normalize();
    currentLook.lerp(desiredLook, 0.03);
    camera.lookAt(camera.position.clone().add(currentLook.multiplyScalar(100)));

    // Slight FOV oscillation for breathing effect
    camera.fov = 95 + Math.sin(simTime * 0.12) * 8;
    camera.updateProjectionMatrix();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// FPV - Procedural Terrain (No Man's Sky style)
// ============================================================================

let terrainGroup = null;
let terrainSeed = 0;
let fpvSky = null;
let fpvSavedFog = null;
let cachedNoise = null;
let cachedBiome = null;

// Seeded PRNG
function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Value noise
function makeNoise(seed) {
    const rng = mulberry32(seed);
    const perm = new Uint8Array(512);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    return function(x, y) {
        const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
        const xf = x - Math.floor(x), yf = y - Math.floor(y);
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const aa = perm[perm[xi] + yi] / 255;
        const ab = perm[perm[xi] + yi + 1] / 255;
        const ba = perm[perm[xi + 1] + yi] / 255;
        const bb = perm[perm[xi + 1] + yi + 1] / 255;
        return aa + u * (ba - aa) + v * (ab - aa) + u * v * (aa - ba - ab + bb);
    };
}

function fbm(fn, x, y, oct, lac, gain) {
    let v = 0, a = 1, f = 1, m = 0;
    for (let i = 0; i < oct; i++) { v += fn(x * f, y * f) * a; m += a; a *= gain; f *= lac; }
    return v / m;
}

// Biome configs per planet type
const BIOMES = {
    molten: {
        ground: [0x1a0800, 0x331100], rock: 0x220a00, accent: 0xff4400, glow: 0xff6600,
        sky: [0x110000, 0x331100], fog: [0x220800, 0.04], hScale: 1.5,
        lava: true, glowFx: true, flora: 'none', rocks: 40,
    },
    ice: {
        ground: [0x99bbdd, 0xddeeff], rock: 0x667788, accent: 0xaaddff, glow: 0x88ccff,
        sky: [0x112244, 0x88aacc], fog: [0xaabbcc, 0.02], hScale: 0.8,
        lava: false, glowFx: false, flora: 'ice_crystals', rocks: 25,
    },
    gas: {
        ground: [0xaa7744, 0xddaa66], rock: 0x886633, accent: 0xeebb77, glow: 0xffcc88,
        sky: [0x443322, 0xcc9955], fog: [0xbb8844, 0.06], hScale: 0.4,
        lava: false, glowFx: false, flora: 'gas_vents', rocks: 15,
    },
    terrestrial: {
        ground: [0x336622, 0x558833], rock: 0x666655, accent: 0x88aa44, glow: 0x44ff88,
        sky: [0x1133aa, 0x88bbee], fog: [0x8899aa, 0.012], hScale: 1.2,
        lava: false, glowFx: false, flora: 'trees', rocks: 30,
    },
    toxic: {
        ground: [0x445500, 0x667700], rock: 0x334400, accent: 0xaacc22, glow: 0xccff44,
        sky: [0x222200, 0x667700], fog: [0x556600, 0.05], hScale: 1.0,
        lava: false, glowFx: true, flora: 'mushrooms', rocks: 35,
    },
    crystal: {
        ground: [0x220044, 0x440088], rock: 0x330066, accent: 0xbb66ff, glow: 0xdd99ff,
        sky: [0x110022, 0x6633aa], fog: [0x331166, 0.025], hScale: 1.8,
        lava: false, glowFx: true, flora: 'crystals', rocks: 50,
    },
};

function getHeight(noise, x, z, hs) {
    let h = fbm(noise, x * 0.03, z * 0.03, 6, 2.1, 0.48) * hs * 4;
    const ridge = 1 - Math.abs(fbm(noise, x * 0.02 + 50, z * 0.02 + 50, 4, 2.0, 0.5) * 2 - 1);
    h += ridge * ridge * hs * 3;
    h += fbm(noise, x * 0.1, z * 0.1, 3, 2.0, 0.4) * hs * 0.5;
    return h;
}

function generateTerrain(planetType) {
    if (terrainGroup) destroyTerrain();
    terrainGroup = new THREE.Group();
    terrainSeed = Math.floor(Math.random() * 99999);
    const noise = makeNoise(terrainSeed);
    const b = BIOMES[planetType] || BIOMES.terrestrial;
    const sz = 120, segs = 200;

    // Ground mesh
    const gGeo = new THREE.PlaneGeometry(sz, sz, segs, segs);
    const pa = gGeo.attributes.position;
    const cols = new Float32Array(pa.count * 3);
    const c1 = new THREE.Color(b.ground[0]), c2 = new THREE.Color(b.ground[1]), cA = new THREE.Color(b.accent);

    for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i);
        const h = getHeight(noise, x, y, b.hScale);
        pa.setZ(i, h);
        const t = Math.min(1, Math.max(0, h / (b.hScale * 5) * 0.5 + 0.5));
        const c = c1.clone().lerp(c2, t);
        if (b.lava && h < b.hScale * 0.3) c.lerp(cA, (1 - h / (b.hScale * 0.3)) * 0.8);
        if (h > b.hScale * 4) c.lerp(new THREE.Color(0xffffff), (h - b.hScale * 4) * 0.1);
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    gGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    gGeo.computeVertexNormals();
    const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.85, metalness: 0.05, flatShading: true,
    }));
    ground.rotation.x = -Math.PI / 2;
    terrainGroup.add(ground);

    const rng = mulberry32(terrainSeed + 1);

    // Rocks
    for (let i = 0; i < b.rocks; i++) {
        const rx = (rng() - 0.5) * sz * 0.8, rz = (rng() - 0.5) * sz * 0.8;
        const ry = getHeight(noise, rx, rz, b.hScale);
        const s = 0.3 + rng() * 1.5;
        const rt = rng();
        const rGeo = rt < 0.3 ? new THREE.DodecahedronGeometry(s, 0) :
                     rt < 0.6 ? new THREE.OctahedronGeometry(s, 0) :
                     new THREE.ConeGeometry(s * 0.6, s * 2, 5);
        const rock = new THREE.Mesh(rGeo, new THREE.MeshStandardMaterial({
            color: b.rock, roughness: 0.9, metalness: b.glowFx ? 0.3 : 0.05, flatShading: true,
        }));
        rock.position.set(rx, ry, rz);
        rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
        terrainGroup.add(rock);
    }

    // Flora
    const floraCount = b.flora === 'trees' ? 80 : b.flora === 'crystals' ? 60 :
                       b.flora === 'mushrooms' ? 50 : b.flora === 'ice_crystals' ? 40 :
                       b.flora === 'gas_vents' ? 30 : 0;
    for (let i = 0; i < floraCount; i++) {
        const fx = (rng() - 0.5) * sz * 0.7, fz = (rng() - 0.5) * sz * 0.7;
        const fy = getHeight(noise, fx, fz, b.hScale);
        const obj = b.flora === 'trees' ? makeTree(rng) :
                    b.flora === 'crystals' ? makeCrystal(rng, b) :
                    b.flora === 'mushrooms' ? makeMushroom(rng, b) :
                    b.flora === 'ice_crystals' ? makeIce(rng) :
                    b.flora === 'gas_vents' ? makeVent(rng, b) : null;
        if (obj) { obj.position.set(fx, fy, fz); terrainGroup.add(obj); }
    }

    // Lava pools
    if (b.lava) {
        const lr = mulberry32(terrainSeed + 100);
        for (let i = 0; i < 8; i++) {
            const px = (lr() - 0.5) * sz * 0.6, pz = (lr() - 0.5) * sz * 0.6;
            const py = getHeight(noise, px, pz, b.hScale) - 0.1;
            const ps = 1 + lr() * 4;
            const pool = new THREE.Mesh(
                new THREE.CircleGeometry(ps, 12),
                new THREE.MeshBasicMaterial({ color: b.accent, transparent: true, opacity: 0.8 })
            );
            pool.rotation.x = -Math.PI / 2;
            pool.position.set(px, py, pz);
            terrainGroup.add(pool);
            const pl = new THREE.PointLight(b.glow, 3, ps * 4);
            pl.position.set(px, py + 0.5, pz);
            terrainGroup.add(pl);
        }
    }

    // Glow orbs
    if (b.glowFx) {
        for (let i = 0; i < 25; i++) {
            const gx = (rng() - 0.5) * sz * 0.6, gz = (rng() - 0.5) * sz * 0.6;
            const gy = getHeight(noise, gx, gz, b.hScale) + 0.1 + rng() * 0.5;
            const orb = new THREE.Mesh(
                new THREE.SphereGeometry(0.05 + rng() * 0.15, 6, 6),
                new THREE.MeshBasicMaterial({ color: b.glow, transparent: true, opacity: 0.6 + rng() * 0.4 })
            );
            orb.position.set(gx, gy, gz);
            terrainGroup.add(orb);
        }
        for (let i = 0; i < 6; i++) {
            const pl = new THREE.PointLight(b.glow, 2, 15);
            pl.position.set((rng() - 0.5) * 30, 0.5 + rng(), (rng() - 0.5) * 30);
            terrainGroup.add(pl);
        }
    }

    // Lighting
    terrainGroup.add(new THREE.AmbientLight(b.fog[0], 0.6));
    const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
    sun.position.set(30, 50, 20);
    terrainGroup.add(sun);

    // Sky dome
    if (fpvSky) { scene.remove(fpvSky); fpvSky.geometry.dispose(); fpvSky.material.dispose(); }
    fpvSky = new THREE.Mesh(
        new THREE.SphereGeometry(500, 32, 16),
        new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(b.sky[0]) },
                botColor: { value: new THREE.Color(b.sky[1]) },
            },
            vertexShader: `varying vec3 vWP; void main(){vec4 w=modelMatrix*vec4(position,1.0);vWP=w.xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
            fragmentShader: `uniform vec3 topColor;uniform vec3 botColor;varying vec3 vWP;void main(){float h=normalize(vWP+20.0).y;gl_FragColor=vec4(mix(botColor,topColor,max(pow(max(h,0.0),0.6),0.0)),1.0);}`,
            side: THREE.BackSide, depthWrite: false,
        })
    );
    scene.add(fpvSky);

    scene.add(terrainGroup);
}

// Flora builders
function makeTree(rng) {
    const g = new THREE.Group();
    const h = 1 + rng() * 3;
    g.add(Object.assign(new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.15, h, 5),
        new THREE.MeshStandardMaterial({ color: 0x553311, roughness: 0.9, flatShading: true })
    ), { position: new THREE.Vector3(0, h / 2, 0) }));
    const fc = [0x22aa44, 0x44cc66, 0x118833, 0x66dd88, 0x009955];
    for (let l = 0; l < 2 + Math.floor(rng() * 3); l++) {
        const r = 0.5 + rng() * 1.2 - l * 0.15;
        const shape = rng();
        const fGeo = shape < 0.3 ? new THREE.SphereGeometry(r, 6, 4) :
                     shape < 0.6 ? new THREE.DodecahedronGeometry(r, 0) :
                     new THREE.ConeGeometry(r, r * 1.5, 6);
        const f = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({
            color: fc[Math.floor(rng() * fc.length)], roughness: 0.8, flatShading: true,
        }));
        f.position.y = h * 0.6 + l * 0.6;
        f.rotation.y = rng() * Math.PI;
        g.add(f);
    }
    return g;
}

function makeCrystal(rng, b) {
    const g = new THREE.Group();
    for (let s = 0; s < 1 + Math.floor(rng() * 4); s++) {
        const h = 0.5 + rng() * 3, r = 0.1 + rng() * 0.4;
        const col = new THREE.Color().setHSL(0.7 + rng() * 0.15, 0.8, 0.5 + rng() * 0.3);
        const shard = new THREE.Mesh(
            new THREE.ConeGeometry(r, h, 4 + Math.floor(rng() * 3)),
            new THREE.MeshStandardMaterial({
                color: col, emissive: col, emissiveIntensity: 0.4 + rng() * 0.4,
                roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.7 + rng() * 0.3, flatShading: true,
            })
        );
        shard.position.set((rng() - 0.5) * 0.8, h / 2, (rng() - 0.5) * 0.8);
        shard.rotation.set((rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.4);
        g.add(shard);
    }
    return g;
}

function makeMushroom(rng, b) {
    const g = new THREE.Group();
    const h = 0.3 + rng() * 1.5, cr = 0.2 + rng() * 0.8;
    g.add(Object.assign(new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, h, 6),
        new THREE.MeshStandardMaterial({ color: 0x998866, roughness: 0.9, flatShading: true })
    ), { position: new THREE.Vector3(0, h / 2, 0) }));
    g.add(Object.assign(new THREE.Mesh(
        new THREE.SphereGeometry(cr, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({
            color: b.accent, emissive: new THREE.Color(b.glow), emissiveIntensity: 0.3, roughness: 0.4, flatShading: true,
        })
    ), { position: new THREE.Vector3(0, h, 0) }));
    for (let i = 0; i < 4; i++) {
        const a = rng() * Math.PI * 2, r2 = cr * 0.5 * rng();
        g.add(Object.assign(new THREE.Mesh(
            new THREE.SphereGeometry(cr * 0.12, 4, 4),
            new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(b.glow), emissiveIntensity: 0.6 })
        ), { position: new THREE.Vector3(Math.cos(a) * r2, h + cr * 0.3, Math.sin(a) * r2) }));
    }
    return g;
}

function makeIce(rng) {
    const g = new THREE.Group();
    for (let s = 0; s < 2 + Math.floor(rng() * 5); s++) {
        const h = 0.5 + rng() * 2.5, r = 0.05 + rng() * 0.2;
        const spike = new THREE.Mesh(
            new THREE.CylinderGeometry(0, r, h, 4),
            new THREE.MeshStandardMaterial({
                color: 0xccddff, emissive: 0x4488cc, emissiveIntensity: 0.15,
                roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.75, flatShading: true,
            })
        );
        spike.position.set((rng() - 0.5) * 0.6, h / 2, (rng() - 0.5) * 0.6);
        spike.rotation.set((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3);
        g.add(spike);
    }
    return g;
}

function makeVent(rng, b) {
    const g = new THREE.Group();
    g.add(Object.assign(new THREE.Mesh(
        new THREE.ConeGeometry(0.5 + rng() * 0.5, 0.3 + rng() * 0.5, 8),
        new THREE.MeshStandardMaterial({ color: b.rock, roughness: 0.9, flatShading: true })
    ), { position: new THREE.Vector3(0, 0.15, 0) }));
    for (let i = 0; i < 12; i++) {
        g.add(Object.assign(new THREE.Mesh(
            new THREE.SphereGeometry(0.1 + rng() * 0.3, 4, 4),
            new THREE.MeshBasicMaterial({ color: b.accent, transparent: true, opacity: 0.15 + rng() * 0.2 })
        ), { position: new THREE.Vector3((rng() - 0.5) * 0.8, 0.5 + rng() * 3, (rng() - 0.5) * 0.8) }));
    }
    return g;
}

function destroyTerrain() {
    if (terrainGroup) {
        scene.remove(terrainGroup);
        terrainGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        terrainGroup = null;
    }
    if (fpvSky) { scene.remove(fpvSky); fpvSky.geometry.dispose(); fpvSky.material.dispose(); fpvSky = null; }
}

// ============================================================================
// FPV enter / exit / update
// ============================================================================

function enterFPV(planet) {
    if (!planet || !planet.alive) return;
    if (panoramicMode) exitPanoramic();

    fpvMode = true;
    fpvPlanet = planet;
    fpvYaw = 0;
    fpvPitch = 0.1;
    fpvLat = 0;
    fpvLon = 0;

    fpvSavedCamPos = camera.position.clone();
    fpvSavedCamTarget = controls.target.clone();
    controls.enabled = false;

    camera.near = 0.01;
    camera.far = 1000;
    camera.updateProjectionMatrix();

    planet.mesh.visible = false;

    generateTerrain(planet.type.type);
    cachedNoise = makeNoise(terrainSeed);
    cachedBiome = BIOMES[planet.type.type] || BIOMES.terrestrial;

    fpvSavedFog = scene.fog;
    const b = BIOMES[planet.type.type] || BIOMES.terrestrial;
    scene.fog = new THREE.FogExp2(b.fog[0], b.fog[1]);

    document.getElementById('fpv-info').style.display = 'flex';
    document.getElementById('btn-fpv').textContent = 'Exit FPV';

    renderer.domElement.requestPointerLock();
}

function exitFPV() {
    if (fpvPlanet) fpvPlanet.mesh.visible = true;
    fpvMode = false;
    fpvPlanet = null;

    destroyTerrain();

    if (fpvSavedCamPos) {
        camera.position.copy(fpvSavedCamPos);
        controls.target.copy(fpvSavedCamTarget);
    }
    camera.up.set(0, 1, 0);
    camera.near = 0.1;
    camera.far = 2000;
    camera.updateProjectionMatrix();

    if (fpvSavedFog) { scene.fog = fpvSavedFog; fpvSavedFog = null; }
    controls.enabled = true;

    document.getElementById('fpv-info').style.display = 'none';
    document.getElementById('btn-fpv').textContent = 'FPV Mode';
    if (document.pointerLockElement) document.exitPointerLock();
}

function updateFPV() {
    if (!fpvMode || !fpvPlanet) return;
    if (!fpvPlanet.alive) { exitFPV(); return; }

    const wp = fpvPlanet.mesh.position;

    terrainGroup.position.copy(wp);
    if (fpvSky) fpvSky.position.copy(wp);

    const walkX = fpvLon * 15, walkZ = fpvLat * 15;
    const groundY = getHeight(cachedNoise, walkX, walkZ, cachedBiome.hScale);

    camera.position.set(wp.x + walkX, wp.y + groundY + 0.4, wp.z + walkZ);
    camera.up.set(0, 1, 0);

    const ld = new THREE.Vector3(
        Math.sin(fpvYaw) * Math.cos(fpvPitch),
        Math.sin(fpvPitch),
        Math.cos(fpvYaw) * Math.cos(fpvPitch)
    );
    camera.lookAt(camera.position.x + ld.x, camera.position.y + ld.y, camera.position.z + ld.z);
}

function setupFPVControls() {
    raycaster = new THREE.Raycaster();

    document.addEventListener('pointerlockchange', () => {
        fpvPointerLocked = !!document.pointerLockElement;
    });

    document.addEventListener('mousemove', (e) => {
        if (!fpvMode || !fpvPointerLocked) return;
        fpvYaw += e.movementX * 0.003;
        fpvPitch -= e.movementY * 0.003;
        fpvPitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, fpvPitch));
    });

    renderer.domElement.addEventListener('click', (e) => {
        if (fpvMode && !fpvPointerLocked) { renderer.domElement.requestPointerLock(); return; }
        if (fpvMode || !fpvPickingMode) return;

        const mouse = new THREE.Vector2(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(planets.filter(p => p.alive).map(p => p.mesh));
        if (hits.length > 0) {
            const p = planets.find(pl => pl.mesh === hits[0].object);
            if (p) { enterFPV(p); fpvPickingMode = false; }
        }
    });

    const keys = {};
    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key === 'Escape' && fpvMode) exitFPV();
    });
    document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

    (function walkLoop() {
        requestAnimationFrame(walkLoop);
        if (!fpvMode) return;
        const sp = 0.02;
        const fwd = sp * ((keys['w'] ? 1 : 0) - (keys['s'] ? 1 : 0));
        const str = sp * ((keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0));
        if (fwd || str) {
            fpvLon += Math.sin(fpvYaw) * fwd + Math.cos(fpvYaw) * str;
            fpvLat += Math.cos(fpvYaw) * fwd - Math.sin(fpvYaw) * str;
        }
    })();
}

let fpvPickingMode = false;

// ============================================================================
// Start
// ============================================================================

init();
