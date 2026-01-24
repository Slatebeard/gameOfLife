// ================================
// BACKGROUND CANVAS
// ================================

const bgCanvas = document.getElementById('backgroundCanvas');
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;

const bgCtx = bgCanvas.getContext('2d');

let hueOffset = 0;
const hueSpeed = 0.5; // degrees per frame

function drawBackground() {
    const gradient = bgCtx.createLinearGradient(0, 0, bgCanvas.width, bgCanvas.height);

    // Shifting colors based on hueOffset
    gradient.addColorStop(0, `hsl(${hueOffset % 360}, 70%, 30%)`);
    gradient.addColorStop(0.5, `hsl(${(hueOffset + 120) % 360}, 70%, 30%)`);
    gradient.addColorStop(1, `hsl(${(hueOffset + 240) % 360}, 70%, 30%)`);

    bgCtx.fillStyle = gradient;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    hueOffset += hueSpeed;
    requestAnimationFrame(drawBackground);
}

drawBackground();
