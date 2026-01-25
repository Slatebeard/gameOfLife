// ================================
// BACKGROUND CANVAS - Swirling Noise
// ================================

const bgCanvas = document.getElementById('backgroundCanvas');
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;

const bgCtx = bgCanvas.getContext('2d');

// Config
const noiseScale = 0.008;
const swirlSpeed = 0.008;
const swirlIntensity = 2;
const pixelSize = 18; // larger = more pixelated
const noiseOctaves = 2; // fewer = less detail
const opacity = 0.1; // 0-1, allows body color to show through

let time = 0;

// Simplex-like noise using permutation table
const perm = [];
for (let i = 0; i < 512; i++) {
    perm[i] = Math.floor(Math.random() * 256);
}

function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
    return a + t * (b - a);
}

function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

function noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = fade(x);
    const v = fade(y);

    const a = perm[X] + Y;
    const b = perm[X + 1] + Y;

    return lerp(
        lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
        lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u),
        v
    );
}

// Fractal noise for more detail
function fbm(x, y, octaves) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
        value += amplitude * noise(x * frequency, y * frequency);
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }

    return value / maxValue;
}

function drawBackground() {
    const imageData = bgCtx.createImageData(bgCanvas.width, bgCanvas.height);
    const data = imageData.data;
    const alpha = Math.floor(opacity * 255);

    for (let y = 0; y < bgCanvas.height; y += pixelSize) {
        for (let x = 0; x < bgCanvas.width; x += pixelSize) {
            // Add swirl distortion
            const dx = x - bgCanvas.width / 2;
            const dy = y - bgCanvas.height / 2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) + dist * 0.002 * Math.sin(time);

            const swirlX = x + Math.cos(angle + time) * swirlIntensity;
            const swirlY = y + Math.sin(angle + time) * swirlIntensity;

            // Get noise value
            const n = fbm(swirlX * noiseScale + time * 0.5, swirlY * noiseScale, noiseOctaves);
            const brightness = Math.floor((n + 1) * 0.5 * 255);

            // Draw pixel block
            for (let py = 0; py < pixelSize && y + py < bgCanvas.height; py++) {
                for (let px = 0; px < pixelSize && x + px < bgCanvas.width; px++) {
                    const idx = ((y + py) * bgCanvas.width + (x + px)) * 4;
                    data[idx] = brightness;
                    data[idx + 1] = brightness;
                    data[idx + 2] = brightness;
                    data[idx + 3] = alpha;
                }
            }
        }
    }

    bgCtx.putImageData(imageData, 0, 0);

    time += swirlSpeed;
    requestAnimationFrame(drawBackground);
}

drawBackground();
