/**
 * SoupyNBody - WebGL Galaxy Simulator
 *
 * Browser-based N-body gravitational simulation using Three.js
 * Optimized for integrated graphics (Intel HD, etc.)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    numParticles: 10000,
    galaxyRadius: 15,
    centralMass: 100000,
    particleMass: 1,
    G: 1,
    softening: 0.5,
    timeScale: 1,
    particleSize: 0.15,
};

// ============================================================================
// Galaxy Simulation Class
// ============================================================================

class GalaxySimulation {
    constructor(numParticles) {
        this.numParticles = numParticles;
        this.positions = new Float32Array(numParticles * 3);
        this.velocities = new Float32Array(numParticles * 3);
        this.masses = new Float32Array(numParticles);
        this.colors = new Float32Array(numParticles * 3);
        this.time = 0;
    }

    initializeGalaxy(radius, centralMass) {
        const n = this.numParticles;

        for (let i = 0; i < n; i++) {
            const idx = i * 3;

            if (i === 0) {
                // Central mass
                this.positions[idx] = 0;
                this.positions[idx + 1] = 0;
                this.positions[idx + 2] = 0;
                this.velocities[idx] = 0;
                this.velocities[idx + 1] = 0;
                this.velocities[idx + 2] = 0;
                this.masses[i] = centralMass;
                this.colors[idx] = 1.0;
                this.colors[idx + 1] = 0.95;
                this.colors[idx + 2] = 0.8;
                continue;
            }

            // Exponential disk distribution
            const u = Math.random();
            let r = -radius * 0.3 * Math.log(1 - u * 0.95);
            r = Math.max(0.5, Math.min(r, radius));

            const theta = Math.random() * Math.PI * 2;

            // Position
            this.positions[idx] = r * Math.cos(theta);
            this.positions[idx + 1] = r * Math.sin(theta);
            this.positions[idx + 2] = (Math.random() - 0.5) * radius * 0.05 * Math.exp(-r / radius);

            // Circular orbital velocity
            const vCirc = Math.sqrt(CONFIG.G * centralMass / r);
            const dispersion = 0.1 * vCirc;

            this.velocities[idx] = -vCirc * Math.sin(theta) + dispersion * (Math.random() - 0.5);
            this.velocities[idx + 1] = vCirc * Math.cos(theta) + dispersion * (Math.random() - 0.5);
            this.velocities[idx + 2] = dispersion * 0.5 * (Math.random() - 0.5);

            // Mass
            this.masses[i] = CONFIG.particleMass;

            // Color based on radius (purple core -> blue outer)
            const t = r / radius;
            this.colors[idx] = 0.4 + 0.5 * (1 - t);     // R
            this.colors[idx + 1] = 0.3 + 0.4 * t;       // G
            this.colors[idx + 2] = 0.8 + 0.2 * (1 - t); // B
        }
    }

    initializeCollision(radius, centralMass) {
        const n = this.numParticles;
        const halfN = Math.floor(n / 2);
        const separation = radius * 3;

        for (let i = 0; i < n; i++) {
            const idx = i * 3;
            const isSecondGalaxy = i >= halfN;
            const localIdx = isSecondGalaxy ? i - halfN : i;

            if (localIdx === 0) {
                // Central mass of each galaxy
                this.positions[idx] = isSecondGalaxy ? separation : 0;
                this.positions[idx + 1] = isSecondGalaxy ? radius * 0.5 : 0;
                this.positions[idx + 2] = 0;
                this.velocities[idx] = isSecondGalaxy ? -0.3 : 0.3;
                this.velocities[idx + 1] = 0;
                this.velocities[idx + 2] = 0;
                this.masses[i] = centralMass * 0.5;
                this.colors[idx] = isSecondGalaxy ? 1.0 : 0.8;
                this.colors[idx + 1] = isSecondGalaxy ? 0.6 : 0.9;
                this.colors[idx + 2] = isSecondGalaxy ? 0.4 : 1.0;
                continue;
            }

            // Disk particles
            const u = Math.random();
            let r = -radius * 0.5 * 0.3 * Math.log(1 - u * 0.95);
            r = Math.max(0.3, Math.min(r, radius * 0.5));

            const theta = Math.random() * Math.PI * 2;
            const centerX = isSecondGalaxy ? separation : 0;
            const centerY = isSecondGalaxy ? radius * 0.5 : 0;

            this.positions[idx] = centerX + r * Math.cos(theta);
            this.positions[idx + 1] = centerY + r * Math.sin(theta);
            this.positions[idx + 2] = (Math.random() - 0.5) * radius * 0.03;

            const vCirc = Math.sqrt(CONFIG.G * centralMass * 0.5 / r);
            const baseVx = isSecondGalaxy ? -0.3 : 0.3;

            this.velocities[idx] = baseVx - vCirc * Math.sin(theta);
            this.velocities[idx + 1] = vCirc * Math.cos(theta);
            this.velocities[idx + 2] = 0;

            this.masses[i] = CONFIG.particleMass;

            // Different colors for each galaxy
            const t = r / (radius * 0.5);
            if (isSecondGalaxy) {
                this.colors[idx] = 1.0 - 0.3 * t;
                this.colors[idx + 1] = 0.5 + 0.3 * t;
                this.colors[idx + 2] = 0.3 + 0.2 * t;
            } else {
                this.colors[idx] = 0.4 + 0.4 * (1 - t);
                this.colors[idx + 1] = 0.6 + 0.3 * t;
                this.colors[idx + 2] = 1.0;
            }
        }
    }

    step(dt) {
        const n = this.numParticles;
        const G = CONFIG.G;
        const softening = CONFIG.softening;
        const softeningSq = softening * softening;

        // For performance on integrated GPU, use central-mass approximation
        // Full N-body would be O(n²) which is too slow for JS

        // Find centers of mass (simplified: just use the central particles)
        const centers = [
            { x: this.positions[0], y: this.positions[1], z: this.positions[2], m: this.masses[0] }
        ];

        // Check if we're in collision mode (second central mass)
        const halfN = Math.floor(n / 2);
        if (this.masses[halfN] > CONFIG.particleMass * 10) {
            centers.push({
                x: this.positions[halfN * 3],
                y: this.positions[halfN * 3 + 1],
                z: this.positions[halfN * 3 + 2],
                m: this.masses[halfN]
            });
        }

        // Update velocities and positions
        for (let i = 0; i < n; i++) {
            const idx = i * 3;

            // Skip central masses
            if (i === 0 || (centers.length > 1 && i === halfN)) {
                // Update central mass positions based on their velocities
                this.positions[idx] += this.velocities[idx] * dt;
                this.positions[idx + 1] += this.velocities[idx + 1] * dt;
                this.positions[idx + 2] += this.velocities[idx + 2] * dt;
                continue;
            }

            const px = this.positions[idx];
            const py = this.positions[idx + 1];
            const pz = this.positions[idx + 2];

            let ax = 0, ay = 0, az = 0;

            // Compute acceleration from all centers of mass
            for (const center of centers) {
                const dx = center.x - px;
                const dy = center.y - py;
                const dz = center.z - pz;
                const distSq = dx * dx + dy * dy + dz * dz + softeningSq;
                const invDist = 1 / Math.sqrt(distSq);
                const invDistCube = invDist * invDist * invDist;
                const force = G * center.m * invDistCube;

                ax += force * dx;
                ay += force * dy;
                az += force * dz;
            }

            // Leapfrog integration
            this.velocities[idx] += ax * dt * 0.5;
            this.velocities[idx + 1] += ay * dt * 0.5;
            this.velocities[idx + 2] += az * dt * 0.5;

            this.positions[idx] += this.velocities[idx] * dt;
            this.positions[idx + 1] += this.velocities[idx + 1] * dt;
            this.positions[idx + 2] += this.velocities[idx + 2] * dt;

            this.velocities[idx] += ax * dt * 0.5;
            this.velocities[idx + 1] += ay * dt * 0.5;
            this.velocities[idx + 2] += az * dt * 0.5;
        }

        // Update central masses' interaction (for collision mode)
        if (centers.length > 1) {
            const dx = centers[1].x - centers[0].x;
            const dy = centers[1].y - centers[0].y;
            const dz = centers[1].z - centers[0].z;
            const distSq = dx * dx + dy * dy + dz * dz + softeningSq;
            const invDist = 1 / Math.sqrt(distSq);
            const invDistCube = invDist * invDist * invDist;

            const force0 = G * centers[1].m * invDistCube;
            const force1 = G * centers[0].m * invDistCube;

            this.velocities[0] += force0 * dx * dt;
            this.velocities[1] += force0 * dy * dt;
            this.velocities[2] += force0 * dz * dt;

            this.velocities[halfN * 3] -= force1 * dx * dt;
            this.velocities[halfN * 3 + 1] -= force1 * dy * dt;
            this.velocities[halfN * 3 + 2] -= force1 * dz * dt;
        }

        this.time += dt;
    }
}

// ============================================================================
// Three.js Renderer
// ============================================================================

class GalaxyRenderer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000510);
        container.appendChild(this.renderer.domElement);

        // Camera position
        this.camera.position.set(0, 20, 40);
        this.camera.lookAt(0, 0, 0);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.5;

        // Particles
        this.particles = null;
        this.geometry = null;

        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    createParticles(simulation) {
        if (this.particles) {
            this.scene.remove(this.particles);
            this.geometry.dispose();
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(simulation.positions, 3)
        );
        this.geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(simulation.colors, 3)
        );

        const material = new THREE.PointsMaterial({
            size: CONFIG.particleSize,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.particles = new THREE.Points(this.geometry, material);
        this.scene.add(this.particles);
    }

    updateParticles(simulation) {
        if (this.geometry) {
            this.geometry.attributes.position.needsUpdate = true;
        }
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// ============================================================================
// Main Application
// ============================================================================

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.renderer = new GalaxyRenderer(this.container);
        this.simulation = new GalaxySimulation(CONFIG.numParticles);
        this.paused = false;
        this.lastTime = 0;
        this.frameCount = 0;
        this.fpsTime = 0;

        this.init();
        this.setupUI();
        this.animate();
    }

    init() {
        this.simulation.initializeGalaxy(CONFIG.galaxyRadius, CONFIG.centralMass);
        this.renderer.createParticles(this.simulation);
        document.getElementById('loading').style.display = 'none';
    }

    setupUI() {
        // Particle count display
        document.getElementById('particle-count').textContent = CONFIG.numParticles;

        // Time scale slider
        const timeSlider = document.getElementById('time-scale');
        timeSlider.addEventListener('input', (e) => {
            CONFIG.timeScale = e.target.value / 100;
        });

        // Galaxy size slider
        const sizeSlider = document.getElementById('galaxy-size');
        sizeSlider.addEventListener('input', (e) => {
            CONFIG.galaxyRadius = 15 * (e.target.value / 100);
        });

        // Pause button
        const pauseBtn = document.getElementById('btn-pause');
        pauseBtn.addEventListener('click', () => {
            this.paused = !this.paused;
            pauseBtn.textContent = this.paused ? 'Resume' : 'Pause';
            this.renderer.controls.autoRotate = !this.paused;
        });

        // Reset button
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.simulation.initializeGalaxy(CONFIG.galaxyRadius, CONFIG.centralMass);
            this.renderer.createParticles(this.simulation);
        });

        // Collision button
        document.getElementById('btn-collision').addEventListener('click', () => {
            this.simulation.initializeCollision(CONFIG.galaxyRadius, CONFIG.centralMass);
            this.renderer.createParticles(this.simulation);
        });
    }

    animate(currentTime = 0) {
        requestAnimationFrame((t) => this.animate(t));

        // Calculate delta time
        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        // Update FPS counter
        this.frameCount++;
        if (currentTime - this.fpsTime >= 1000) {
            document.getElementById('fps').textContent = this.frameCount;
            this.frameCount = 0;
            this.fpsTime = currentTime;
        }

        // Update simulation
        if (!this.paused && dt > 0) {
            const simDt = dt * CONFIG.timeScale;
            this.simulation.step(simDt);
            this.renderer.updateParticles(this.simulation);
            document.getElementById('sim-time').textContent = this.simulation.time.toFixed(2);
        }

        // Render
        this.renderer.render();
    }
}

// Start the application
window.addEventListener('DOMContentLoaded', () => {
    new App();
});
