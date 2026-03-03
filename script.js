const CONFIG = {
    GRID_MIN: -10,
    GRID_MAX: 10,
    GRID_UNIT: 35,
    POINT_RADIUS: 8,
    COLORS: {
        grid: 'rgba(63, 63, 70, 0.5)',
        gridSubtle: 'rgba(63, 63, 70, 0.3)',
        axis: '#22d3ee',
        line: '#22d3ee',
        pointA: '#22d3ee',
        pointB: '#a3e635',
        pointC: '#f472b6',
        pointD: '#fb923c',
        riseRun: '#c084fc',
        midpoint: '#fb923c',
        shape: 'rgba(34, 211, 238, 0.15)',
        shapeStroke: '#22d3ee'
    }
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let currentModule = 'line-builder';
let draggingPoint = null;

let lineBuilder = {
    points: [
        { x: -3, y: -2, label: 'A', color: CONFIG.COLORS.pointA },
        { x: 3, y: 4, label: 'B', color: CONFIG.COLORS.pointB }
    ],
    showRiseRun: false
};

let slopeRacer = {
    isPlaying: false,
    score: 0,
    streak: 0,
    questionNum: 0,
    totalQuestions: 10,
    difficulty: 'easy',
    currentQuestion: null,
    timeLeft: 15,
    timerInterval: null
};

let shapeExplorer = {
    mode: 'triangle',
    points: [],
    isPlacing: true
};

let whatChanged = {
    isPlaying: false,
    score: 0,
    streak: 0,
    questionNum: 0,
    totalQuestions: 10,
    currentQuestion: null,
    isAnimating: false,
    animProgress: 0
};

function gridToCanvas(x, y) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    return { x: centerX + x * CONFIG.GRID_UNIT, y: centerY - y * CONFIG.GRID_UNIT };
}

function canvasToGrid(px, py) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    return { x: (px - centerX) / CONFIG.GRID_UNIT, y: (centerY - py) / CONFIG.GRID_UNIT };
}

function snapToGrid(val) {
    const snapped = Math.round(val);
    return Math.max(CONFIG.GRID_MIN, Math.min(CONFIG.GRID_MAX, snapped));
}

function formatNumber(n) {
    if (!isFinite(n)) return 'undefined';
    if (Number.isInteger(n) || n === 0) return n.toString();
    const frac = simplifyFraction(n);
    if (frac.denom === 1) return frac.numer.toString();
    return `${frac.numer}/${frac.denom}`;
}

function simplifyFraction(decimal) {
    if (decimal === 0) return { numer: 0, denom: 1 };
    const tolerance = 1.0E-6;
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = decimal;
    do {
        let a = Math.floor(b);
        let aux = h1;
        h1 = a * h1 + h2;
        h2 = aux;
        aux = k1;
        k1 = a * k1 + k2;
        k2 = aux;
        b = 1 / (b - a);
    } while (Math.abs(decimal - h1 / k1) > Math.abs(decimal) * tolerance);
    return { numer: h1, denom: k1 };
}

function slope(p1, p2) {
    if (p2.x === p1.x) return Infinity;
    return (p2.y - p1.y) / (p2.x - p1.x);
}

function distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function midpoint(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

function lineEquation(p1, p2) {
    const m = slope(p1, p2);
    if (m === Infinity) return { type: 'vertical', x: p1.x };
    const b = p1.y - m * p1.x;
    return { type: 'slope-intercept', m, b };
}

function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area / 2);
}

function polygonPerimeter(points) {
    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        perimeter += distance(points[i], points[j]);
    }
    return perimeter;
}

function classifyTriangle(points) {
    const d1 = distance(points[0], points[1]);
    const d2 = distance(points[1], points[2]);
    const d3 = distance(points[2], points[0]);
    const sorted = [d1, d2, d3].sort((a, b) => a - b);
    const tolerance = 0.01;
    const isRight = Math.abs(sorted[0] * sorted[0] + sorted[1] * sorted[1] - sorted[2] * sorted[2]) < tolerance;

    if (Math.abs(sorted[0] - sorted[1]) < tolerance && Math.abs(sorted[1] - sorted[2]) < tolerance) {
        return { type: 'Equilateral', isRight: false };
    }
    if (Math.abs(sorted[0] - sorted[1]) < tolerance || Math.abs(sorted[1] - sorted[2]) < tolerance) {
        return { type: 'Isosceles', isRight };
    }
    return { type: 'Scalene', isRight };
}

function classifyQuadrilateral(points) {
    const sides = [
        distance(points[0], points[1]),
        distance(points[1], points[2]),
        distance(points[2], points[3]),
        distance(points[3], points[0])
    ];
    const diagonals = [distance(points[0], points[2]), distance(points[1], points[3])];
    const slopes = [
        slope(points[0], points[1]),
        slope(points[1], points[2]),
        slope(points[2], points[3]),
        slope(points[3], points[0])
    ];

    function slopesEqual(s1, s2) {
        if (!isFinite(s1) && !isFinite(s2)) return true;
        return Math.abs(s1 - s2) < 0.01;
    }

    const tolerance = 0.01;
    const equalSides = Math.abs(sides[0] - sides[1]) < tolerance && Math.abs(sides[1] - sides[2]) < tolerance && Math.abs(sides[2] - sides[3]) < tolerance;
    const equalDiagonals = Math.abs(diagonals[0] - diagonals[1]) < tolerance;
    const hasParallelPairs = slopesEqual(slopes[0], slopes[2]) && slopesEqual(slopes[1], slopes[3]);

    if (equalDiagonals && hasParallelPairs && !equalSides) return 'Rectangle';
    if (equalSides && equalDiagonals) return 'Square';
    if (equalSides && !equalDiagonals) return 'Rhombus';
    if (hasParallelPairs) return 'Parallelogram';
    if (slopesEqual(slopes[0], slopes[2]) || slopesEqual(slopes[1], slopes[3])) return 'Trapezoid';
    return 'Irregular';
}

function centroid(points) {
    const n = points.length;
    const cx = points.reduce((sum, p) => sum + p.x, 0) / n;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / n;
    return { x: cx, y: cy };
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function drawGrid() {
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(34, 211, 238, 0.01)';
    for (let i = 0; i < canvas.width; i += 80) {
        for (let j = 0; j < canvas.height; j += 80) {
            ctx.beginPath();
            ctx.arc(i, j, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.strokeStyle = CONFIG.COLORS.gridSubtle;
    ctx.lineWidth = 1;
    for (let i = CONFIG.GRID_MIN; i <= CONFIG.GRID_MAX; i++) {
        const pos = gridToCanvas(i, 0);
        ctx.beginPath();
        ctx.moveTo(pos.x, 0);
        ctx.lineTo(pos.x, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, pos.y);
        ctx.lineTo(canvas.width, pos.y);
        ctx.stroke();
    }

    ctx.strokeStyle = CONFIG.COLORS.grid;
    for (let i = CONFIG.GRID_MIN; i <= CONFIG.GRID_MAX; i++) {
        if (i === 0) continue;
        const pos = gridToCanvas(i, 0);
        ctx.beginPath();
        ctx.moveTo(pos.x, 0);
        ctx.lineTo(pos.x, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, pos.y);
        ctx.lineTo(canvas.width, pos.y);
        ctx.stroke();
    }

    const yZero = gridToCanvas(0, 0).y;
    const xZero = gridToCanvas(0, 0).x;

    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = CONFIG.COLORS.axis;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yZero);
    ctx.lineTo(canvas.width, yZero);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xZero, 0);
    ctx.lineTo(xZero, canvas.height);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(161, 161, 170, 0.8)';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = CONFIG.GRID_MIN; i <= CONFIG.GRID_MAX; i++) {
        if (i === 0) continue;
        const pos = gridToCanvas(i, 0);
        ctx.fillText(i.toString(), pos.x, yZero + 10);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = CONFIG.GRID_MIN; i <= CONFIG.GRID_MAX; i++) {
        if (i === 0) continue;
        const pos = gridToCanvas(0, i);
        ctx.fillText(i.toString(), xZero - 10, pos.y);
    }

    ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
    ctx.fillText('0', xZero - 10, yZero + 10);
}

function drawPoint(point, isHovered = false) {
    const pos = gridToCanvas(point.x, point.y);
    const radius = isHovered ? CONFIG.POINT_RADIUS + 2 : CONFIG.POINT_RADIUS;

    ctx.shadowColor = point.color;
    ctx.shadowBlur = isHovered ? 20 : 12;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(9, 9, 11, 0.9)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(pos.x - radius/3, pos.y - radius/3, 0, pos.x, pos.y, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, point.color);
    gradient.addColorStop(1, point.color + 'aa');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(pos.x - radius/3, pos.y - radius/3, radius/4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();

    ctx.fillStyle = '#fafafa';
    ctx.font = 'bold 12px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(point.label, pos.x, pos.y - 14);
    ctx.shadowBlur = 0;
}

function drawLineThroughPoints(p1, p2, color = CONFIG.COLORS.line) {
    const m = slope(p1, p2);

    if (m === Infinity) {
        const x = p1.x;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(gridToCanvas(x, 0).x, 0);
        ctx.lineTo(gridToCanvas(x, 0).x, canvas.height);
        ctx.stroke();
        return;
    }

    const b = p1.y - m * p1.x;
    const x1 = CONFIG.GRID_MIN;
    const y1 = m * x1 + b;
    const x2 = CONFIG.GRID_MAX;
    const y2 = m * x2 + b;

    const start = gridToCanvas(x1, y1);
    const end = gridToCanvas(x2, y2);

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
}

function drawRiseRun(p1, p2) {
    const rise = p2.y - p1.y;
    const run = p2.x - p1.x;

    const runEnd = gridToCanvas(p2.x, p1.y);
    const p1Canvas = gridToCanvas(p1.x, p1.y);

    ctx.strokeStyle = CONFIG.COLORS.riseRun;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(p1Canvas.x, p1Canvas.y);
    ctx.lineTo(runEnd.x, runEnd.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(runEnd.x, runEnd.y);
    ctx.lineTo(runEnd.x, gridToCanvas(p2.x, p2.y).y);
    ctx.stroke();

    ctx.setLineDash([]);

    ctx.fillStyle = CONFIG.COLORS.riseRun;
    ctx.font = 'bold 14px Space Grotesk';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`run = ${run}`, (p1Canvas.x + runEnd.x) / 2, p1Canvas.y + 5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`rise = ${rise}`, runEnd.x + 5, (p1Canvas.y + runEnd.y) / 2);
}

function drawMidpoint(p1, p2) {
    const mp = midpoint(p1, p2);
    const pos = gridToCanvas(mp.x, mp.y);

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.COLORS.midpoint;
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('M', pos.x, pos.y - 8);
}

function drawShape(points, fillColor = CONFIG.COLORS.shape, strokeColor = CONFIG.COLORS.shapeStroke) {
    if (points.length < 2) return;

    ctx.beginPath();
    const start = gridToCanvas(points[0].x, points[0].y);
    ctx.moveTo(start.x, start.y);

    for (let i = 1; i < points.length; i++) {
        const pos = gridToCanvas(points[i].x, points[i].y);
        ctx.lineTo(pos.x, pos.y);
    }

    if (points.length > 2) {
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
}

function initLineBuilder() {
    lineBuilder.points = [
        { x: -3, y: -2, label: 'A', color: CONFIG.COLORS.pointA },
        { x: 3, y: 4, label: 'B', color: CONFIG.COLORS.pointB }
    ];
    lineBuilder.showRiseRun = false;
    renderLineBuilder();
    render();
    drawLineBuilder();
}

function renderLineBuilder() {
    const sidebar = document.getElementById('sidebar');
    const p1 = lineBuilder.points[0];
    const p2 = lineBuilder.points[1];
    const m = slope(p1, p2);
    const dist = distance(p1, p2);
    const mp = midpoint(p1, p2);
    const eq = lineEquation(p1, p2);

    let slopeDisplay = 'undefined';
    if (m !== Infinity) {
        const frac = simplifyFraction(m);
        slopeDisplay = frac.denom === 1 ? frac.numer.toString() : `${frac.numer}/${frac.denom} ≈ ${m.toFixed(2)}`;
    }

    let equationDisplay = eq.type === 'vertical' ? `x = ${eq.x}` : `y = ${formatNumber(eq.m)}x ${eq.b >= 0 ? '+' : ''} ${formatNumber(eq.b)}`;

    let specialCase = '';
    if (m === Infinity) specialCase = '<span class="text-pink-400">Vertical line — slope undefined</span>';
    else if (Math.abs(m) < 0.001) specialCase = '<span class="text-lime-400">Horizontal line — slope = 0</span>';
    else if (Math.abs(Math.abs(m) - 1) < 0.001) specialCase = `<span class="text-purple-400">${m > 0 ? '45°' : '-45°'} line</span>`;

    sidebar.innerHTML = `
        <div class="fade-in">
            <h2 class="font-display text-xl font-bold mb-1">Line Builder</h2>
            <p class="text-zinc-500 text-sm mb-6">Drag points A and B to explore lines</p>

            <div class="stat-card p-4 mb-4">
                <div class="property-row">
                    <span class="text-zinc-400 text-sm">Slope (m)</span>
                    <span id="slopeValue" class="font-mono text-cyan-400 font-semibold">${slopeDisplay}</span>
                </div>
                ${m !== Infinity ? `<div class="text-xs text-zinc-600 mt-1">m = (${p2.y} − ${p1.y}) / (${p2.x} − ${p1.x})</div>` : ''}
                ${specialCase ? `<div class="mt-3 p-3 bg-pink-500/10 border border-pink-500/30 rounded-lg text-sm">${specialCase}</div>` : ''}

                <div class="property-row mt-3">
                    <span class="text-zinc-400 text-sm">Y-intercept (b)</span>
                    <span id="interceptValue" class="font-mono text-cyan-400 font-semibold">${m !== Infinity ? formatNumber(eq.b) : 'undefined'}</span>
                </div>

                <div class="property-row">
                    <span class="text-zinc-400 text-sm">Equation</span>
                    <span id="equationValue" class="font-mono text-lime-400 font-semibold">${equationDisplay}</span>
                </div>
            </div>

            <div class="stat-card p-4 mb-4">
                <div class="property-row">
                    <span class="text-zinc-400 text-sm">Distance |AB|</span>
                    <span id="distanceValue" class="font-mono text-orange-400 font-semibold">${dist.toFixed(2)}</span>
                </div>
                <div class="property-row mt-3">
                    <span class="text-zinc-400 text-sm">Midpoint M</span>
                    <span id="midpointValue" class="font-mono text-orange-400 font-semibold">(${formatNumber(mp.x)}, ${formatNumber(mp.y)})</span>
                </div>
            </div>

            <label class="flex items-center gap-3 cursor-pointer p-3 card">
                <div class="toggle-switch ${lineBuilder.showRiseRun ? 'active' : ''}" id="showRiseRunToggle"></div>
                <span class="text-sm text-zinc-300">Show rise & run</span>
            </label>

            <button id="resetLineBuilder" class="btn-secondary w-full py-3 rounded-lg mt-4">Reset Points</button>
        </div>
    `;

    document.getElementById('showRiseRunToggle').addEventListener('click', () => {
        lineBuilder.showRiseRun = !lineBuilder.showRiseRun;
        render();
        drawLineBuilder();
    });

    document.getElementById('resetLineBuilder').addEventListener('click', () => {
        lineBuilder.points = [
            { x: -3, y: -2, label: 'A', color: CONFIG.COLORS.pointA },
            { x: 3, y: 4, label: 'B', color: CONFIG.COLORS.pointB }
        ];
        updateLineBuilderValues();
        render();
        drawLineBuilder();
    });
}

function updateLineBuilderValues() {
    const p1 = lineBuilder.points[0];
    const p2 = lineBuilder.points[1];
    const m = slope(p1, p2);
    const dist = distance(p1, p2);
    const mp = midpoint(p1, p2);
    const eq = lineEquation(p1, p2);

    const slopeEl = document.getElementById('slopeValue');
    const interceptEl = document.getElementById('interceptValue');
    const equationEl = document.getElementById('equationValue');
    const distanceEl = document.getElementById('distanceValue');
    const midpointEl = document.getElementById('midpointValue');

    if (slopeEl) slopeEl.textContent = m !== Infinity ? (simplifyFraction(m).denom === 1 ? simplifyFraction(m).numer : `${simplifyFraction(m).numer}/${simplifyFraction(m).denom} ≈ ${m.toFixed(2)}`) : 'undefined';
    if (interceptEl) interceptEl.textContent = m !== Infinity ? formatNumber(eq.b) : 'undefined';
    if (equationEl) equationEl.textContent = eq.type === 'vertical' ? `x = ${eq.x}` : `y = ${formatNumber(eq.m)}x ${eq.b >= 0 ? '+' : ''} ${formatNumber(eq.b)}`;
    if (distanceEl) distanceEl.textContent = dist.toFixed(2);
    if (midpointEl) midpointEl.textContent = `(${formatNumber(mp.x)}, ${formatNumber(mp.y)})`;
}

function drawLineBuilder() {
    drawLineThroughPoints(lineBuilder.points[0], lineBuilder.points[1]);
    if (lineBuilder.showRiseRun) drawRiseRun(lineBuilder.points[0], lineBuilder.points[1]);
    drawMidpoint(lineBuilder.points[0], lineBuilder.points[1]);
    lineBuilder.points.forEach(p => drawPoint(p));
}

const SLOPE_RACER_QUESTIONS = {
    easy: {
        slope: () => {
            const m = randomInt(-5, 5);
            if (m === 0) return SLOPE_RACER_QUESTIONS.easy.slope();
            const b = randomInt(-3, 3);
            const p1 = { x: -2, y: m * -2 + b };
            const p2 = { x: 2, y: m * 2 + b };
            const wrongAnswers = shuffle([m + 1, m - 1, m + 2].filter(x => x !== m)).slice(0, 3);
            return {
                type: 'A', p1, p2,
                question: 'What is the slope of this line?',
                correct: m,
                options: shuffle([m, ...wrongAnswers]),
                explanation: `The slope is ${m}.`
            };
        },
        equation: () => {
            const m = randomInt(1, 4);
            const b = randomInt(-3, 3);
            const eq = `y = ${m}x ${b >= 0 ? '+' : ''} ${b}`;
            const p1 = { x: -2, y: m * -2 + b };
            const p2 = { x: 2, y: m * 2 + b };
            return {
                type: 'B', p1, p2,
                question: 'Which equation matches this line?',
                correct: eq,
                options: shuffle([eq, `y = ${m + 1}x ${b >= 0 ? '+' : ''} ${b}`, `y = ${m}x ${b >= 0 ? '+' : ''} ${b + 1}`, `y = ${m - 1}x ${b >= 0 ? '+' : ''} ${b}`]),
                explanation: `The line has slope ${m} and y-intercept ${b}.`
            };
        },
        yIntercept: () => {
            const m = randomInt(1, 3);
            const b = randomInt(1, 4);
            const px = randomInt(0, 2);
            const p1 = { x: px, y: m * px + b };
            return {
                type: 'C',
                question: `A line has slope ${m} and passes through (${p1.x}, ${p1.y}). Click where it crosses the Y-axis.`,
                correct: { x: 0, y: b },
                targetPoint: { x: 0, y: b },
                explanation: `The y-intercept is at (0, ${b}).`
            };
        }
    },
    medium: {
        slope: () => {
            const numerators = [1, 2, 3, -1, -2, -3];
            const denominator = randomChoice([2, 3, 4]);
            const sign = randomChoice([1, -1]);
            const m = (sign * randomChoice(numerators.filter(n => Math.abs(n) <= denominator))) / denominator;
            if (m === 0 || !isFinite(m)) return SLOPE_RACER_QUESTIONS.medium.slope();
            const b = randomInt(-3, 3);
            const p1 = { x: 0, y: b };
            const p2 = { x: denominator, y: m * denominator + b };
            const wrongAnswers = shuffle([m + 0.5, m - 0.5, m + 1].filter(x => Math.abs(x - m) > 0.1)).slice(0, 3).map(n => parseFloat(n.toFixed(2)));
            return {
                type: 'A', p1, p2,
                question: 'What is the slope of this line?',
                correct: parseFloat(m.toFixed(2)),
                options: shuffle([parseFloat(m.toFixed(2)), ...wrongAnswers.slice(0, 3)]),
                explanation: `The slope is ${m.toFixed(2)}.`
            };
        }
    }
};

function initSlopeRacer() {
    slopeRacer.isPlaying = false;
    renderSlopeRacerStart();
    render();
}

function renderSlopeRacerStart() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <div class="fade-in">
            <h2 class="font-display text-xl font-bold mb-1">Slope Racer</h2>
            <p class="text-zinc-500 text-sm mb-6">Test your slope knowledge!</p>

            <div class="mb-6">
                <label class="block text-sm text-zinc-400 mb-2">Difficulty</label>
                <select id="difficulty" class="w-full">
                    <option value="easy">Easy — Integer slopes</option>
                    <option value="medium">Medium — Fractions allowed</option>
                </select>
            </div>

            <button id="startSlopeRacer" class="btn-primary w-full py-3.5 rounded-lg text-base font-semibold">Start Game</button>

            <div class="mt-6 card p-4">
                <div class="text-sm text-zinc-400 mb-3 font-medium">How to play:</div>
                <ul class="text-sm text-zinc-500 space-y-2">
                    <li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>Answer 10 questions</li>
                    <li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-lime-400"></span>+10 points per correct</li>
                    <li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-orange-400"></span>+5 bonus for speed</li>
                    <li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>+5 for 3 in a row</li>
                </ul>
            </div>
        </div>
    `;

    document.getElementById('startSlopeRacer').addEventListener('click', () => {
        slopeRacer.difficulty = document.getElementById('difficulty').value;
        startSlopeRacer();
    });
}

function startSlopeRacer() {
    slopeRacer.isPlaying = true;
    slopeRacer.score = 0;
    slopeRacer.streak = 0;
    slopeRacer.questionNum = 0;
    renderSlopeRacerGame();
    nextSlopeRacerQuestion();
}

function renderSlopeRacerGame() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <div class="fade-in">
            <div class="flex justify-between items-center mb-3">
                <span class="text-zinc-400 text-sm">Question</span>
                <span class="font-mono text-cyan-400">${slopeRacer.questionNum}/${slopeRacer.totalQuestions}</span>
            </div>

            <div class="mb-4">
                <div class="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div id="timerBar" class="timer-bar h-full bg-gradient-to-r from-cyan-400 to-lime-400" style="width: 100%"></div>
                </div>
            </div>

            <div class="stat-card p-3 mb-4 flex justify-between items-center">
                <span class="text-zinc-400 text-sm">Score</span>
                <span class="font-mono text-xl text-lime-400 font-bold">${slopeRacer.score}</span>
            </div>

            ${slopeRacer.streak >= 2 ? `<div class="mb-4 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-400 text-sm text-center">${slopeRacer.streak + 1} in a row!</div>` : ''}

            <div class="card p-4 mb-4">
                <p class="text-zinc-200 font-medium">${slopeRacer.currentQuestion ? slopeRacer.currentQuestion.question : ''}</p>
            </div>

            <div id="optionsArea" class="space-y-2"></div>
        </div>
    `;

    setupSlopeRacerInteraction();
}

function setupSlopeRacerInteraction() {
    const q = slopeRacer.currentQuestion;
    const optionsArea = document.getElementById('optionsArea');

    if (q.type === 'C') {
        optionsArea.innerHTML = `<p class="text-sm text-zinc-500">Click on the canvas at the correct point!</p>`;
        canvas.onclick = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const grid = canvasToGrid(x, y);
            const snapped = { x: snapToGrid(grid.x), y: snapToGrid(grid.y) };
            const dist = distance(snapped, q.targetPoint);
            handleSlopeRacerAnswer(dist < 1);
        };
    } else {
        canvas.onclick = null;
        optionsArea.innerHTML = q.options.map(opt => `
            <button class="btn-option w-full py-3 px-4 rounded-lg font-medium" data-answer="${opt}">${opt}</button>
        `).join('');

        setTimeout(() => {
            document.querySelectorAll('.btn-option').forEach(btn => {
                btn.onclick = () => {
                    const answer = btn.dataset.answer;
                    const correct = answer == q.correct;
                    handleSlopeRacerAnswer(correct);
                };
            });
        }, 10);
    }
}

function nextSlopeRacerQuestion() {
    if (slopeRacer.questionNum >= slopeRacer.totalQuestions) {
        endSlopeRacer();
        return;
    }

    slopeRacer.questionNum++;
    const questionTypes = Object.keys(SLOPE_RACER_QUESTIONS[slopeRacer.difficulty]);
    const type = randomChoice(questionTypes);
    slopeRacer.currentQuestion = SLOPE_RACER_QUESTIONS[slopeRacer.difficulty][type]();
    slopeRacer.timeLeft = 15;

    renderSlopeRacerGame();
    drawSlopeRacerQuestion();
    startSlopeRacerTimer();
}

function startSlopeRacerTimer() {
    if (slopeRacer.timerInterval) clearInterval(slopeRacer.timerInterval);
    slopeRacer.timerInterval = setInterval(() => {
        slopeRacer.timeLeft -= 0.1;
        if (slopeRacer.timeLeft < 0) slopeRacer.timeLeft = 0;
        const percent = (slopeRacer.timeLeft / 15) * 100;
        const timerBar = document.getElementById('timerBar');
        if (timerBar) {
            timerBar.style.width = percent + '%';
            if (percent < 30) timerBar.className = 'timer-bar h-full bg-gradient-to-r from-red-500 to-orange-400';
        }
    }, 100);
}

function drawSlopeRacerQuestion() {
    render();
    const q = slopeRacer.currentQuestion;
    if (q.p1 && q.p2) {
        drawLineThroughPoints(q.p1, q.p2);
        drawPoint({ x: q.p1.x, y: q.p1.y, label: '', color: '#666' });
        drawPoint({ x: q.p2.x, y: q.p2.y, label: '', color: '#666' });
    }
}

function handleSlopeRacerAnswer(isCorrect) {
    if (slopeRacer.timerInterval) clearInterval(slopeRacer.timerInterval);

    const flash = document.getElementById('flashOverlay');
    const q = slopeRacer.currentQuestion;

    if (isCorrect) {
        flash.className = 'flash-overlay correct';
        let points = 10;
        if (slopeRacer.timeLeft > 10) points += 5;
        slopeRacer.streak++;
        if (slopeRacer.streak % 3 === 0) points += 5;
        slopeRacer.score += points;
    } else {
        flash.className = 'flash-overlay incorrect';
        slopeRacer.streak = 0;
    }

    setTimeout(() => flash.className = 'flash-overlay', 500);

    const optionsArea = document.getElementById('optionsArea');
    optionsArea.innerHTML = `
        <div class="p-4 ${isCorrect ? 'bg-lime-500/10 border-lime-500' : 'bg-pink-500/10 border-pink-500'} border rounded">
            <div class="font-bold mb-1 ${isCorrect ? 'text-lime-400' : 'text-pink-400'}">${isCorrect ? 'Correct!' : 'Wrong!'}</div>
            <div class="text-sm text-zinc-400">${q.explanation}</div>
            ${!isCorrect ? `<div class="text-sm mt-2">Correct: <span class="text-cyan-400">${q.correct}</span></div>` : ''}
        </div>
    `;

    setTimeout(() => nextSlopeRacerQuestion(), 2000);
}

function endSlopeRacer() {
    if (slopeRacer.timerInterval) clearInterval(slopeRacer.timerInterval);

    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <div class="fade-in">
            <div class="game-over-card rounded-2xl p-6 mb-6 text-center relative overflow-hidden">
                <div class="relative z-10">
                    <h2 class="font-display text-lg text-zinc-400 mb-2">Final Score</h2>
                    <div class="text-6xl font-bold bg-gradient-to-r from-cyan-400 to-lime-400 bg-clip-text text-transparent">${slopeRacer.score}</div>
                    <div class="text-zinc-500">points</div>
                </div>
            </div>
            <button id="playAgain" class="btn-primary w-full py-3.5 rounded-lg font-semibold">Play Again</button>
        </div>
    `;

    canvas.onclick = null;
    render();

    document.getElementById('playAgain').addEventListener('click', () => initSlopeRacer());
}

function initShapeExplorer() {
    shapeExplorer.points = [];
    shapeExplorer.isPlacing = true;
    shapeExplorer.mode = 'triangle';
    renderShapeExplorer();
    render();
    drawShapeExplorer();
}

function renderShapeExplorer() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <div class="fade-in">
            <h2 class="font-display text-xl font-bold mb-1">Shape Explorer</h2>
            <p class="text-zinc-500 text-sm mb-4">Discover geometric properties</p>

            <div class="flex gap-2 mb-4">
                <button id="modeTriangle" class="flex-1 btn-option py-2.5 rounded-lg text-sm font-medium ${shapeExplorer.mode === 'triangle' ? 'border-cyan-400 text-cyan-400' : ''}">Triangle</button>
                <button id="modeQuad" class="flex-1 btn-option py-2.5 rounded-lg text-sm font-medium ${shapeExplorer.mode === 'quadrilateral' ? 'border-cyan-400 text-cyan-400' : ''}">Quadrilateral</button>
            </div>

            <div id="shapeInfo">
                ${shapeExplorer.isPlacing ? `
                    <div class="stat-card p-4">
                        <p class="text-zinc-300 text-sm mb-3">Click ${shapeExplorer.mode === 'triangle' ? '3' : '4'} times on canvas to place points</p>
                        <div class="flex items-center gap-2">
                            <div class="flex gap-1">
                                ${[...Array(shapeExplorer.mode === 'triangle' ? 3 : 4)].map((_, i) => `<div class="w-2.5 h-2.5 rounded-full ${i < shapeExplorer.points.length ? 'bg-cyan-400' : 'bg-zinc-700'}"></div>`).join('')}
                            </div>
                            <span class="text-cyan-400 font-mono text-sm">${shapeExplorer.points.length}/${shapeExplorer.mode === 'triangle' ? 3 : 4}</span>
                        </div>
                    </div>
                ` : renderShapeProperties()}
            </div>

            <button id="resetShape" class="btn-secondary w-full py-3 rounded-lg mt-4">Reset / Clear</button>
        </div>
    `;

    document.getElementById('modeTriangle').addEventListener('click', () => {
        shapeExplorer.mode = 'triangle';
        shapeExplorer.points = [];
        shapeExplorer.isPlacing = true;
        renderShapeExplorer();
        render();
    });

    document.getElementById('modeQuad').addEventListener('click', () => {
        shapeExplorer.mode = 'quadrilateral';
        shapeExplorer.points = [];
        shapeExplorer.isPlacing = true;
        renderShapeExplorer();
        render();
    });

    document.getElementById('resetShape').addEventListener('click', () => {
        shapeExplorer.points = [];
        shapeExplorer.isPlacing = true;
        renderShapeExplorer();
        render();
    });
}

function renderShapeProperties() {
    const points = shapeExplorer.points;
    const labels = ['A', 'B', 'C', 'D'];
    const colors = [CONFIG.COLORS.pointA, CONFIG.COLORS.pointB, CONFIG.COLORS.pointC, CONFIG.COLORS.pointD];

    if (shapeExplorer.mode === 'triangle') {
        const area = polygonArea(points);
        const perimeter = polygonPerimeter(points);
        const classification = classifyTriangle(points);

        return `
            <div class="stat-card p-4">
                <div class="text-sm text-zinc-400 mb-3">Side Lengths</div>
                ${points.map((p, i) => {
                    const next = points[(i + 1) % points.length];
                    return `<div class="flex justify-between text-sm mb-2"><span style="color:${colors[i]}">${labels[i]}${labels[(i+1)%3]}</span><span id="side-${i}" class="font-mono">${distance(p, next).toFixed(2)}</span></div>`;
                }).join('')}
            </div>
            <div class="stat-card p-4"><div class="flex justify-between"><span class="text-zinc-400">Perimeter</span><span id="perimeterValue" class="font-mono text-cyan-400">${perimeter.toFixed(2)}</span></div></div>
            <div class="stat-card p-4"><div class="flex justify-between"><span class="text-zinc-400">Area</span><span id="areaValue" class="font-mono text-lime-400">${area.toFixed(2)}</span></div></div>
            <div class="stat-card p-4"><div class="text-sm text-zinc-400 mb-2">Classification</div><div id="classificationValue" class="font-mono text-lg ${classification.isRight ? 'text-purple-400' : 'text-orange-400'} font-bold">${classification.type}${classification.isRight ? ' (Right)' : ''}</div></div>
            <div class="stat-card p-4">
                <div class="text-sm text-zinc-400 mb-3">Slopes</div>
                ${points.map((p, i) => {
                    const next = points[(i + 1) % points.length];
                    const m = slope(p, next);
                    return `<div class="flex justify-between text-sm mb-2"><span>${labels[i]}${labels[(i+1)%3]}</span><span id="slope-${i}" class="font-mono">${m === Infinity ? 'undefined' : m.toFixed(2)}</span></div>`;
                }).join('')}
            </div>
        `;
    } else {
        const area = polygonArea(points);
        const perimeter = polygonPerimeter(points);
        const classification = classifyQuadrilateral(points);
        const diag1 = distance(points[0], points[2]);
        const diag2 = distance(points[1], points[3]);

        return `
            <div class="stat-card p-4">
                <div class="text-sm text-zinc-400 mb-3">Side Lengths</div>
                ${points.map((p, i) => {
                    const next = points[(i + 1) % points.length];
                    return `<div class="flex justify-between text-sm mb-2"><span style="color:${colors[i]}">${labels[i]}${labels[(i+1)%4]}</span><span id="side-${i}" class="font-mono">${distance(p, next).toFixed(2)}</span></div>`;
                }).join('')}
            </div>
            <div class="stat-card p-4"><div class="flex justify-between"><span class="text-zinc-400">Perimeter</span><span id="perimeterValue" class="font-mono text-cyan-400">${perimeter.toFixed(2)}</span></div></div>
            <div class="stat-card p-4"><div class="flex justify-between"><span class="text-zinc-400">Area</span><span id="areaValue" class="font-mono text-lime-400">${area.toFixed(2)}</span></div></div>
            <div class="stat-card p-4"><div class="flex justify-between"><span class="text-zinc-400">Diagonals</span><span class="font-mono text-orange-400">${diag1.toFixed(2)}, ${diag2.toFixed(2)}</span></div></div>
            <div class="stat-card p-4"><div class="text-sm text-zinc-400 mb-2">Classification</div><div id="classificationValue" class="font-mono text-lg text-purple-400 font-bold">${classification}</div></div>
            <div class="stat-card p-4">
                <div class="text-sm text-zinc-400 mb-3">Slopes</div>
                ${points.map((p, i) => {
                    const next = points[(i + 1) % points.length];
                    const m = slope(p, next);
                    return `<div class="flex justify-between text-sm mb-2"><span>${labels[i]}${labels[(i+1)%4]}</span><span id="slope-${i}" class="font-mono">${m === Infinity ? 'undefined' : m.toFixed(2)}</span></div>`;
                }).join('')}
            </div>
        `;
    }
}

function updateShapeExplorerValues() {
    const points = shapeExplorer.points;
    if (points.length === 0) return;

    const n = points.length;
    for (let i = 0; i < n; i++) {
        const next = points[(i + 1) % n];
        const dist = distance(points[i], next);
        const el = document.getElementById(`side-${i}`);
        if (el) el.textContent = dist.toFixed(2);
    }

    const perimeterEl = document.getElementById('perimeterValue');
    const areaEl = document.getElementById('areaValue');
    if (perimeterEl) perimeterEl.textContent = polygonPerimeter(points).toFixed(2);
    if (areaEl) areaEl.textContent = polygonArea(points).toFixed(2);

    for (let i = 0; i < n; i++) {
        const next = points[(i + 1) % n];
        const m = slope(points[i], next);
        const el = document.getElementById(`slope-${i}`);
        if (el) el.textContent = m === Infinity ? 'undefined' : m.toFixed(2);
    }
}

function drawShapeExplorer() {
    const points = shapeExplorer.points;
    const labels = ['A', 'B', 'C', 'D'];
    const colors = [CONFIG.COLORS.pointA, CONFIG.COLORS.pointB, CONFIG.COLORS.pointC, CONFIG.COLORS.pointD];

    if (points.length >= 2) drawShape(points);

    points.forEach((p, i) => {
        drawPoint({ x: p.x, y: p.y, label: labels[i], color: colors[i] });
    });

    if (points.length === 3) {
        const c = centroid(points);
        const cp = gridToCanvas(c.x, c.y);
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.COLORS.midpoint;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('G', cp.x, cp.y - 8);
    }
}

function initWhatChanged() {
    whatChanged.isPlaying = false;
    renderWhatChangedStart();
    render();
}

function renderWhatChangedStart() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <div class="fade-in">
            <h2 class="font-display text-xl font-bold mb-1">What Changed?</h2>
            <p class="text-zinc-500 text-sm mb-6">Predict what happens to geometric properties!</p>
            <button id="startWhatChanged" class="btn-primary w-full py-3.5 rounded-lg text-base font-semibold mb-6">Start Game</button>
            <div class="card p-4">
                <div class="text-sm text-zinc-400 mb-3 font-medium">How to play:</div>
                <ul class="text-sm text-zinc-500 space-y-2">
                    <li>A shape/line is shown</li>
                    <li>A change is described</li>
                    <li>Predict the outcome</li>
                    <li>Watch the animation</li>
                </ul>
            </div>
        </div>
    `;

    document.getElementById('startWhatChanged').addEventListener('click', () => startWhatChanged());
}

function startWhatChanged() {
    whatChanged.isPlaying = true;
    whatChanged.score = 0;
    whatChanged.streak = 0;
    whatChanged.questionNum = 0;
    nextWhatChangedQuestion();
}

function nextWhatChangedQuestion() {
    if (whatChanged.questionNum >= whatChanged.totalQuestions) {
        endWhatChanged();
        return;
    }

    whatChanged.questionNum++;

    const questions = [
        {
            setup: () => {
                const m = randomChoice([1, 2, -1, -2]);
                const b = randomInt(-2, 2);
                return { p1: { x: -2, y: m * -2 + b }, p2: { x: 2, y: m * 2 + b }, b };
            },
            change: (s) => ({ type: 'movePoint', to: { x: s.p2.x, y: s.p2.y + randomInt(1, 2) } }),
            q: 'Point B moves up. Will the slope increase, decrease, or stay the same?',
            answers: ['Increase', 'Decrease', 'Stay the same'],
            pred: (i, f) => f.m > i.m ? 'increase' : f.m < i.m ? 'decrease' : 'stay the same',
            exp: (i, f) => `Slope changed from ${i.m.toFixed(2)} to ${f.m.toFixed(2)}.`
        },
        {
            setup: () => {
                const points = [{ x: 0, y: 0 }, { x: randomInt(2, 4), y: 0 }, { x: 0, y: randomInt(2, 4) }];
                return { points };
            },
            change: (s) => ({ type: 'moveVertex', to: { x: s.points[1].x + 1, y: 0 } }),
            q: 'The base extends. Will the area increase or decrease?',
            answers: ['Increase', 'Decrease'],
            pred: (i, f) => f.area > i.area ? 'increase' : 'decrease',
            exp: (i, f) => `Area changed from ${i.area.toFixed(1)} to ${f.area.toFixed(1)}.`
        }
    ];

    const template = randomChoice(questions);
    const setup = template.setup();
    const change = template.change(setup);

    let initial = {}, final = {};
    if (setup.p1 && setup.p2) {
        initial = { m: slope(setup.p1, setup.p2), b: setup.b };
        final = { m: slope(setup.p1, change.to), b: setup.b };
    } else if (setup.points) {
        initial.area = polygonArea(setup.points);
        let newPoints = [...setup.points];
        newPoints[1] = change.to;
        final.area = polygonArea(newPoints);
    }

    whatChanged.currentQuestion = {
        question: template.q,
        setup, change, initial, final,
        predict: template.pred,
        answers: template.answers,
        explanation: template.exp
    };

    whatChanged.startState = JSON.parse(JSON.stringify(setup));
    whatChanged.endState = JSON.parse(JSON.stringify(setup));
    if (change.to) whatChanged.endState.p2 = change.to;
    if (change.to && setup.points) whatChanged.endState.points[1] = change.to;

    renderWhatChangedGame();
    drawWhatChangedQuestion();
}

function renderWhatChangedGame() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <div class="fade-in">
            <div class="flex justify-between items-center mb-3">
                <span class="text-zinc-400 text-sm">Question</span>
                <span class="font-mono text-cyan-400">${whatChanged.questionNum}/${whatChanged.totalQuestions}</span>
            </div>
            <div class="stat-card p-3 mb-4 flex justify-between items-center">
                <span class="text-zinc-400 text-sm">Score</span>
                <span class="font-mono text-xl text-lime-400 font-bold">${whatChanged.score}</span>
            </div>
            <div class="card p-4 mb-4">
                <p class="text-zinc-200 font-medium">${whatChanged.currentQuestion ? whatChanged.currentQuestion.question : ''}</p>
            </div>
            <div id="predictionArea" class="space-y-2"></div>
        </div>
    `;

    const q = whatChanged.currentQuestion;
    const predArea = document.getElementById('predictionArea');
    predArea.innerHTML = q.answers.map(ans => `
        <button class="btn-option w-full py-3 px-4 rounded-lg font-medium" data-answer="${ans.toLowerCase()}">${ans}</button>
    `).join('');

    setTimeout(() => {
        document.querySelectorAll('.btn-option').forEach(btn => {
            btn.onclick = () => handlePrediction(btn.dataset.answer);
        });
    }, 10);
}

function drawWhatChangedQuestion() {
    render();
    const q = whatChanged.currentQuestion;
    const state = whatChanged.endState;

    if (state.p1 && state.p2) {
        drawLineThroughPoints(state.p1, state.p2);
        drawPoint({ ...state.p1, label: 'A', color: CONFIG.COLORS.pointA });
        drawPoint({ ...state.p2, label: 'B', color: CONFIG.COLORS.pointB });
    } else if (state.points) {
        drawShape(state.points);
        state.points.forEach((p, i) => drawPoint({ x: p.x, y: p.y, label: String.fromCharCode(65 + i), color: [CONFIG.COLORS.pointA, CONFIG.COLORS.pointB, CONFIG.COLORS.pointC][i] }));
    }
}

function handlePrediction(prediction) {
    const q = whatChanged.currentQuestion;
    const correct = q.predict(q.initial, q.final);
    const isCorrect = prediction === correct;

    if (isCorrect) {
        whatChanged.score += 10;
        whatChanged.streak++;
    } else {
        whatChanged.streak = 0;
    }

    document.getElementById('predictionArea').innerHTML = `
        <div class="p-4 ${isCorrect ? 'bg-lime-500/10 border-lime-500' : 'bg-pink-500/10 border-pink-500'} border rounded">
            <div class="font-bold mb-1 ${isCorrect ? 'text-lime-400' : 'text-pink-400'}">${isCorrect ? 'Correct!' : 'Wrong!'}</div>
            <div class="text-sm text-zinc-400">${q.explanation(q.initial, q.final)}</div>
        </div>
    `;

    setTimeout(() => nextWhatChangedQuestion(), 2500);
}

function endWhatChanged() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <div class="fade-in">
            <div class="game-over-card rounded-2xl p-6 mb-6 text-center relative overflow-hidden">
                <div class="relative z-10">
                    <h2 class="font-display text-lg text-zinc-400 mb-2">Final Score</h2>
                    <div class="text-6xl font-bold bg-gradient-to-r from-cyan-400 to-lime-400 bg-clip-text text-transparent">${whatChanged.score}</div>
                    <div class="text-zinc-500">points</div>
                </div>
            </div>
            <button id="playAgain" class="btn-primary w-full py-3.5 rounded-lg font-semibold">Play Again</button>
        </div>
    `;

    render();
    document.getElementById('playAgain').addEventListener('click', () => initWhatChanged());
}

function setupCanvasEvents() {
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
}

function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const grid = canvasToGrid(x, y);

    if (currentModule === 'line-builder') {
        for (let i = 0; i < lineBuilder.points.length; i++) {
            if (distance(grid, lineBuilder.points[i]) < 0.5) {
                draggingPoint = i;
                return;
            }
        }
    } else if (currentModule === 'shape-explorer' && shapeExplorer.isPlacing) {
        const snapped = { x: snapToGrid(grid.x), y: snapToGrid(grid.y) };
        const labels = ['A', 'B', 'C', 'D'];
        const colors = [CONFIG.COLORS.pointA, CONFIG.COLORS.pointB, CONFIG.COLORS.pointC, CONFIG.COLORS.pointD];
        const idx = shapeExplorer.points.length;
        shapeExplorer.points.push({ x: snapped.x, y: snapped.y, label: labels[idx], color: colors[idx] });

        const maxPoints = shapeExplorer.mode === 'triangle' ? 3 : 4;
        if (shapeExplorer.points.length >= maxPoints) shapeExplorer.isPlacing = false;

        renderShapeExplorer();
        drawShapeExplorer();
    } else if (currentModule === 'shape-explorer' && !shapeExplorer.isPlacing) {
        for (let i = 0; i < shapeExplorer.points.length; i++) {
            if (distance(grid, shapeExplorer.points[i]) < 0.5) {
                draggingPoint = i;
                return;
            }
        }
    }
}

function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const grid = canvasToGrid(x, y);

    if (draggingPoint !== null) {
        const snapped = { x: snapToGrid(grid.x), y: snapToGrid(grid.y) };

        if (currentModule === 'line-builder') {
            lineBuilder.points[draggingPoint] = { ...lineBuilder.points[draggingPoint], ...snapped };
            updateLineBuilderValues();
            render();
            drawLineBuilder();
        } else if (currentModule === 'shape-explorer' && shapeExplorer.points.length > 0) {
            shapeExplorer.points[draggingPoint] = { ...shapeExplorer.points[draggingPoint], ...snapped };
            updateShapeExplorerValues();
            render();
            drawShapeExplorer();
        }
    }

    render();
    if (currentModule === 'line-builder') drawLineBuilder();
    if (currentModule === 'shape-explorer') drawShapeExplorer();
}

function handleMouseUp() {
    draggingPoint = null;
    if (currentModule === 'shape-explorer' && shapeExplorer.points.length > 0) {
        renderShapeExplorer();
    }
}

function setupNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const module = tab.dataset.module;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (canvas.onclick) canvas.onclick = null;
            if (slopeRacer.timerInterval) clearInterval(slopeRacer.timerInterval);

            switch (module) {
                case 'line-builder': initLineBuilder(); break;
                case 'slope-racer': initSlopeRacer(); break;
                case 'shape-explorer': initShapeExplorer(); break;
                case 'what-changed': initWhatChanged(); break;
            }
        });
    });
}

function init() {
    canvas.width = 700;
    canvas.height = 700;
    setupNavigation();
    setupCanvasEvents();
    initLineBuilder();
}

init();
