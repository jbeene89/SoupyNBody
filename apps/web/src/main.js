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

    // Create planets
    createPlanets();

    // Pre-allocate debris arrays
    allocateDebris();

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
    // Pick 3-4 random planet types
    const shuffled = [...PLANET_TYPES].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 4);

    // Arrange them on a collision course
    const arrangements = [
        { pos: new THREE.Vector3(-35, 5, -10), vel: new THREE.Vector3(4, -0.5, 1) },
        { pos: new THREE.Vector3(35, -5, 10), vel: new THREE.Vector3(-4, 0.5, -1) },
        { pos: new THREE.Vector3(0, 30, -20), vel: new THREE.Vector3(0.5, -3.5, 2) },
        { pos: new THREE.Vector3(5, -30, 15), vel: new THREE.Vector3(-0.5, 3, -1.5) },
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

        const planet = {
            mesh,
            vel: arrangements[i].vel.clone(),
            mass: pType.mass,
            radius: pType.radius,
            type: pType,
            alive: true,
            angularVel: (Math.random() - 0.5) * 2,
            rotationAxis: new THREE.Vector3(
                Math.random() - 0.5,
                1,
                Math.random() - 0.5
            ).normalize(),
        };
        planets.push(planet);

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

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // Position: spread around collision point
        const spread = 3 + Math.random() * 5;
        debrisPos[i3] = midX + (Math.random() - 0.5) * spread;
        debrisPos[i3+1] = midY + (Math.random() - 0.5) * spread;
        debrisPos[i3+2] = midZ + (Math.random() - 0.5) * spread;

        // Velocity: explosive + inherited momentum
        const speed = 5 + Math.random() * 25;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        debrisVel[i3] = avgVelX + Math.sin(phi) * Math.cos(theta) * speed;
        debrisVel[i3+1] = avgVelY + Math.sin(phi) * Math.sin(theta) * speed;
        debrisVel[i3+2] = avgVelZ + Math.cos(phi) * speed;

        debrisLife[i] = 1.0;
        debrisMass[i] = totalMass / count;

        // Color from either planet
        const c = Math.random() > 0.5 ? colorsA : colorsB;
        const ci = Math.floor(Math.random() * c.length);
        const col = new THREE.Color(c[ci]);
        // Add some hot white/orange for fresh debris
        const heat = Math.random();
        if (heat > 0.7) {
            col.lerp(new THREE.Color(0xffffaa), heat - 0.7);
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

function createShockwave(position) {
    const geo = new THREE.RingGeometry(0.1, 1, 64);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(position);
    ring.lookAt(camera.position);
    scene.add(ring);
    shockwaves.push({ mesh: ring, scale: 1, opacity: 0.8 });

    // Second shockwave perpendicular
    const ring2 = ring.clone();
    ring2.material = mat.clone();
    ring2.rotation.x += Math.PI / 2;
    scene.add(ring2);
    shockwaves.push({ mesh: ring2, scale: 1, opacity: 0.8 });

    // Flash
    const flashGeo = new THREE.SphereGeometry(2, 16, 16);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(position);
    scene.add(flash);
    shockwaves.push({ mesh: flash, scale: 2, opacity: 1, isFlash: true });
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

    // Planet-planet gravity and collision detection
    for (let i = 0; i < activePlanets.length; i++) {
        const a = activePlanets[i];
        for (let j = i + 1; j < activePlanets.length; j++) {
            const b = activePlanets[j];

            const dx = b.mesh.position.x - a.mesh.position.x;
            const dy = b.mesh.position.y - a.mesh.position.y;
            const dz = b.mesh.position.z - a.mesh.position.z;
            const dist2 = dx*dx + dy*dy + dz*dz + CONFIG.softening;
            const dist = Math.sqrt(dist2);

            // Gravity
            const F = CONFIG.G * a.mass * b.mass / dist2;
            const fx = F * dx / dist;
            const fy = F * dy / dist;
            const fz = F * dz / dist;

            a.vel.x += fx / a.mass * dt;
            a.vel.y += fy / a.mass * dt;
            a.vel.z += fz / a.mass * dt;
            b.vel.x -= fx / b.mass * dt;
            b.vel.y -= fy / b.mass * dt;
            b.vel.z -= fz / b.mass * dt;

            // Collision detection
            if (dist < (a.radius + b.radius) * 0.9) {
                handleCollision(a, b);
            }
        }

        // Update position
        a.mesh.position.x += a.vel.x * dt;
        a.mesh.position.y += a.vel.y * dt;
        a.mesh.position.z += a.vel.z * dt;

        // Rotation
        a.mesh.rotateOnAxis(a.rotationAxis, a.angularVel * dt);
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

function handleCollision(a, b) {
    collisionOccurred = true;

    // Spawn debris
    spawnDebris(
        a.mesh.position, b.mesh.position,
        a.vel, b.vel,
        a.type, b.type,
        a.mass + b.mass
    );

    // Shockwave
    const mid = a.mesh.position.clone().add(b.mesh.position).multiplyScalar(0.5);
    createShockwave(mid);

    // Remove both planets
    a.alive = false;
    b.alive = false;
    scene.remove(a.mesh);
    scene.remove(b.mesh);

    // Check if this was the last pair - trigger coalescence after a delay
    const remaining = planets.filter(p => p.alive);
    if (remaining.length === 0) {
        // Store collision center and combined properties
        setTimeout(() => {
            startCoalescence(mid, a, b);
        }, 3000);
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
        aliveCount++;

        const i3 = i * 3;

        // Gravity from surviving planets
        for (const p of activePlanets) {
            const dx = p.mesh.position.x - debrisPos[i3];
            const dy = p.mesh.position.y - debrisPos[i3+1];
            const dz = p.mesh.position.z - debrisPos[i3+2];
            const dist2 = dx*dx + dy*dy + dz*dz + 1;
            const dist = Math.sqrt(dist2);
            const F = CONFIG.G * p.mass / dist2;
            debrisVel[i3] += F * dx / dist * dt;
            debrisVel[i3+1] += F * dy / dist * dt;
            debrisVel[i3+2] += F * dz / dist * dt;
        }

        // Particle-particle interaction for nearby debris (every 100th for performance)
        if (i % 50 === frameCount % 50) {
            for (let j = i + 1; j < Math.min(i + 200, debrisCount); j++) {
                if (debrisLife[j] <= 0) continue;
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

        // Slow fade
        debrisLife[i] -= dt * 0.01;

        // Color cooling effect
        if (debrisColor[i3] > 0.3) {
            debrisColor[i3] -= dt * 0.02;
        }
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
        if (sw.isFlash) {
            sw.scale += dt * 30;
            sw.opacity -= dt * 3;
            sw.mesh.scale.setScalar(sw.scale);
        } else {
            sw.scale += CONFIG.shockwaveSpeed * dt;
            sw.opacity -= dt * 0.8;
            sw.mesh.scale.setScalar(sw.scale);
        }
        sw.mesh.material.opacity = Math.max(0, sw.opacity);

        if (sw.opacity <= 0) {
            scene.remove(sw.mesh);
            shockwaves.splice(i, 1);
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
        });
    });

    document.getElementById('btn-fpv').addEventListener('click', () => {
        if (fpvMode) {
            exitFPV();
            return;
        }
        // Enter picking mode - user clicks a planet to land on
        const alive = planets.filter(p => p.alive);
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

    planets = [];
    moons = [];
    shockwaves = [];
    collisionOccurred = false;
    coalescencePhase = false;
    coalescenceProgress = 0;
    finalPlanet = null;
    debrisActive = false;
    if (debris) debris.visible = false;
    simTime = 0;

    createPlanets();
    document.getElementById('particle-count').textContent = planets.length + ' planets';
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
    }

    if (fpvMode) {
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
        document.getElementById('sim-time').textContent = simTime.toFixed(2);
        frameCount = 0;
        lastFpsTime = now;
    }

    // Update particle count display
    const alivePlanets = planets.filter(p => p.alive).length;
    const aliveMoons = moons.filter(m => m.alive).length;
    let status = `${alivePlanets} planets, ${aliveMoons} moons`;
    if (debrisActive) status += `, ${CONFIG.debrisCount.toLocaleString()} debris`;
    if (coalescencePhase) status += ' [COALESCING]';
    document.getElementById('particle-count').textContent = status;
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// FPV (First Person View) - Surface of a Planet
// ============================================================================

function enterFPV(planet) {
    if (!planet || !planet.alive) return;

    fpvMode = true;
    fpvPlanet = planet;
    fpvYaw = 0;
    fpvPitch = 0.1;
    fpvLat = Math.random() * Math.PI * 0.5 - Math.PI * 0.25; // near equator
    fpvLon = Math.random() * Math.PI * 2;

    // Save camera state
    fpvSavedCamPos = camera.position.clone();
    fpvSavedCamTarget = controls.target.clone();

    // Disable orbit controls
    controls.enabled = false;

    // Show FPV info
    document.getElementById('fpv-info').style.display = 'flex';
    document.getElementById('btn-fpv').textContent = 'Exit FPV';

    // Request pointer lock for mouse look
    renderer.domElement.requestPointerLock();
}

function exitFPV() {
    fpvMode = false;
    fpvPlanet = null;

    // Restore camera
    if (fpvSavedCamPos) {
        camera.position.copy(fpvSavedCamPos);
        controls.target.copy(fpvSavedCamTarget);
    }
    camera.up.set(0, 1, 0);

    controls.enabled = true;

    document.getElementById('fpv-info').style.display = 'none';
    document.getElementById('btn-fpv').textContent = 'FPV Mode';

    // Exit pointer lock
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
}

function updateFPV() {
    if (!fpvMode || !fpvPlanet) return;

    // If the planet we're on got destroyed, eject
    if (!fpvPlanet.alive) {
        exitFPV();
        return;
    }

    const planet = fpvPlanet;
    const r = planet.radius;
    const pos = planet.mesh.position;

    // Slowly rotate longitude with planet's own rotation
    fpvLon += planet.angularVel * 0.016 * CONFIG.timeScale * 0.1;

    // Surface position in planet local space
    const surfaceHeight = r * 1.02; // slightly above surface
    const localX = surfaceHeight * Math.cos(fpvLat) * Math.cos(fpvLon);
    const localY = surfaceHeight * Math.sin(fpvLat);
    const localZ = surfaceHeight * Math.cos(fpvLat) * Math.sin(fpvLon);

    // World position = planet center + local offset
    const camX = pos.x + localX;
    const camY = pos.y + localY;
    const camZ = pos.z + localZ;

    camera.position.set(camX, camY, camZ);

    // "Up" direction is away from planet center (surface normal)
    const up = new THREE.Vector3(localX, localY, localZ).normalize();
    camera.up.copy(up);

    // Build a look direction from yaw/pitch relative to surface
    // Tangent basis on the sphere surface
    const north = new THREE.Vector3(
        -Math.sin(fpvLat) * Math.cos(fpvLon),
        Math.cos(fpvLat),
        -Math.sin(fpvLat) * Math.sin(fpvLon)
    ).normalize();

    const east = new THREE.Vector3().crossVectors(up, north).normalize();
    // Recompute north to ensure orthogonality
    north.crossVectors(east, up).normalize();

    // Look direction from yaw (horizontal) and pitch (vertical)
    const lookDir = new THREE.Vector3();
    const cosP = Math.cos(fpvPitch);
    lookDir.addScaledVector(north, cosP * Math.cos(fpvYaw));
    lookDir.addScaledVector(east, cosP * Math.sin(fpvYaw));
    lookDir.addScaledVector(up, Math.sin(fpvPitch));
    lookDir.normalize();

    const lookTarget = new THREE.Vector3(
        camX + lookDir.x * 100,
        camY + lookDir.y * 100,
        camZ + lookDir.z * 100
    );

    camera.lookAt(lookTarget);
}

function setupFPVControls() {
    raycaster = new THREE.Raycaster();

    // Pointer lock change
    document.addEventListener('pointerlockchange', () => {
        fpvPointerLocked = !!document.pointerLockElement;
    });

    // Mouse move for FPV look
    document.addEventListener('mousemove', (e) => {
        if (!fpvMode) return;

        if (fpvPointerLocked) {
            fpvYaw += e.movementX * 0.003;
            fpvPitch -= e.movementY * 0.003;
            fpvPitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, fpvPitch));
        }
    });

    // Click to select planet for FPV
    renderer.domElement.addEventListener('click', (e) => {
        if (fpvMode && !fpvPointerLocked) {
            // Re-lock pointer
            renderer.domElement.requestPointerLock();
            return;
        }

        if (fpvMode) return;

        // Only do planet picking if FPV button was recently clicked
        if (!fpvPickingMode) return;

        const mouse = new THREE.Vector2(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(mouse, camera);

        const meshes = planets.filter(p => p.alive).map(p => p.mesh);
        const hits = raycaster.intersectObjects(meshes);

        if (hits.length > 0) {
            const hitMesh = hits[0].object;
            const planet = planets.find(p => p.mesh === hitMesh);
            if (planet) {
                enterFPV(planet);
                fpvPickingMode = false;
            }
        }
    });

    // ESC to exit FPV
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && fpvMode) {
            exitFPV();
        }
        // WASD to walk on surface
        if (fpvMode) {
            const walkSpeed = 0.05;
            if (e.key === 'w' || e.key === 'W') fpvLat += walkSpeed;
            if (e.key === 's' || e.key === 'S') fpvLat -= walkSpeed;
            if (e.key === 'a' || e.key === 'A') fpvLon -= walkSpeed;
            if (e.key === 'd' || e.key === 'D') fpvLon += walkSpeed;
            fpvLat = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, fpvLat));
        }
    });
}

let fpvPickingMode = false;

// ============================================================================
// Start
// ============================================================================

init();
