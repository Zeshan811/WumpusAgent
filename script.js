
// ═══════════════════════════════════════════════════════
//  WUMPUS WORLD – KNOWLEDGE-BASED AGENT
//  Propositional Logic + Resolution Refutation
// ═══════════════════════════════════════════════════════

// ── STATE ──────────────────────────────────────────────
let ROWS, COLS, PITS_COUNT;
let world = {};          // world[r][c] = {pit, wumpus, gold, breeze, stench}
let agent = {};          // {r, c, alive, hasGold, score}
let kb = [];             // array of clause-sets (CNF clauses)
let visited = new Set();
let safeKnown = new Set();
let dangerKnown = new Set();
let inferenceSteps = 0;
let agentMoves = 0;
let autoTimer = null;
let gameActive = false;

// ── HELPERS ────────────────────────────────────────────
const key = (r, c) => `${r},${c}`;
const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const neighbors = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => inBounds(a, b));

function addStatus(msg, cls = '') {
    const el = document.getElementById('status-log');
    el.innerHTML += `<div style="color:${cls || '#94a3b8'}">${msg}</div>`;
    el.scrollTop = el.scrollHeight;
}

function addKB(msg) {
    const el = document.getElementById('kb-log');
    el.innerHTML += `<div>${msg}</div>`;
    el.scrollTop = el.scrollHeight;
}

function addResolution(msg, cls = '') {
    const el = document.getElementById('resolution-log');
    el.innerHTML += `<div style="color:${cls || '#86efac'}">${msg}</div>`;
    el.scrollTop = el.scrollHeight;
}

function updateMetrics() {
    document.getElementById('m-steps').textContent = inferenceSteps;
    document.getElementById('m-moves').textContent = agentMoves;
    document.getElementById('m-kb').textContent = kb.length;
    document.getElementById('m-safe').textContent = safeKnown.size;
}

// ── WORLD GENERATION ───────────────────────────────────
function initGame() {
    ROWS = parseInt(document.getElementById('inp-rows').value) || 4;
    COLS = parseInt(document.getElementById('inp-cols').value) || 4;
    PITS_COUNT = parseInt(document.getElementById('inp-pits').value) || 3;
    ROWS = Math.max(3, Math.min(8, ROWS));
    COLS = Math.max(3, Math.min(8, COLS));
    PITS_COUNT = Math.max(1, Math.min(ROWS * COLS - 3, PITS_COUNT));

    kb = [];
    visited.clear();
    safeKnown.clear();
    dangerKnown.clear();
    inferenceSteps = 0;
    agentMoves = 0;
    gameActive = true;

    document.getElementById('kb-log').innerHTML = '';
    document.getElementById('status-log').innerHTML = '';
    document.getElementById('resolution-log').innerHTML = '';
    document.getElementById('overlay').classList.remove('show');

    // Build empty world
    world = {};
    for (let r = 0; r < ROWS; r++) {
        world[r] = {};
        for (let c = 0; c < COLS; c++)
            world[r][c] = { pit: false, wumpus: false, gold: false, breeze: false, stench: false };
    }

    // Place agent at (0,0) — always safe
    agent = { r: 0, c: 0, alive: true, hasGold: false };

    // Random pits (not at start)
    let placed = 0, attempts = 0;
    while (placed < PITS_COUNT && attempts < 200) {
        attempts++;
        let r = Math.floor(Math.random() * ROWS);
        let c = Math.floor(Math.random() * COLS);
        if ((r === 0 && c === 0) || world[r][c].pit) continue;
        world[r][c].pit = true;
        placed++;
    }

    // One wumpus (not at start)
    let wr, wc;
    do { wr = Math.floor(Math.random() * ROWS); wc = Math.floor(Math.random() * COLS); }
    while (wr === 0 && wc === 0 || world[wr][wc].pit);
    world[wr][wc].wumpus = true;

    // Gold (not at start, not on pit/wumpus)
    let gr, gc;
    do { gr = Math.floor(Math.random() * ROWS); gc = Math.floor(Math.random() * COLS); }
    while ((gr === 0 && gc === 0) || world[gr][gc].pit || world[gr][gc].wumpus);
    world[gr][gc].gold = true;

    // Compute breeze & stench
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
            for (const [nr, nc] of neighbors(r, c)) {
                if (world[nr][nc].pit) world[r][c].breeze = true;
                if (world[nr][nc].wumpus) world[r][c].stench = true;
            }
        }

    // Start cell is always safe
    safeKnown.add(key(0, 0));
    addStatus('▶ New episode started. Agent at (1,1).', '#00d4ff');
    addStatus(`Grid: ${ROWS}×${COLS} | Pits: ${PITS_COUNT}`, '#94a3b8');

    // First percept
    visitCell(0, 0);
    renderGrid();
    updateMetrics();
}

// ── VISIT & PERCEIVE ───────────────────────────────────
function visitCell(r, c) {
    visited.add(key(r, c));
    safeKnown.add(key(r, c));
    const cell = world[r][c];

    // If agent steps on pit or wumpus → dead
    if (cell.pit || cell.wumpus) {
        agent.alive = false;
        const cause = cell.pit ? 'fell into a Pit 🌀' : 'eaten by Wumpus 👹';
        addStatus(`💀 AGENT DIED — ${cause}`, '#ef4444');
        showOverlay('💀 Agent Died', `The agent ${cause} at (${r + 1},${c + 1}).`);
        gameActive = false;
        renderGrid();
        updateMetrics();
        return;
    }

    if (cell.gold && !agent.hasGold) {
        agent.hasGold = true;
        addStatus('🏆 GOLD FOUND! Agent picks up gold.', '#f59e0b');
        showOverlay('🏆 Gold Found!', `Agent grabbed the gold at (${r + 1},${c + 1})! Episode complete.`);
        gameActive = false;
    }

    // Perceive
    let percepts = [];
    if (cell.breeze) percepts.push('💨 Breeze');
    if (cell.stench) percepts.push('💀 Stench');
    if (cell.gold) percepts.push('✨ Glitter');
    const perceptStr = percepts.length ? percepts.join('  ') : '🔇 Nothing';
    document.getElementById('percept-display').innerHTML =
        `<b>At (${r + 1},${c + 1}):</b> ${perceptStr}`;

    // Tell KB
    tellKB(r, c, cell.breeze, cell.stench);
}

// ── KNOWLEDGE BASE ─────────────────────────────────────
// We store rules as CNF clause-sets.
// Each clause = Set of literal strings like "P_1_2", "~P_1_2"
// P_r_c = Pit at (r,c), W_r_c = Wumpus at (r,c)

function tellKB(r, c, breeze, stench) {
    const pos = `(${r + 1},${c + 1})`;

    if (breeze) {
        // B_{r, c} ↔ ∨ P_{nr, nc}  for each neighbor
        // CNF: for each neighbor, P_{nr, nc} is a possible pit
        const nbs = neighbors(r, c);
        // Clause: at least one neighbor is a pit
        const clause = new Set(nbs.map(([nr, nc]) => `P_${nr}_${nc}`));
        kb.push(clause);
        addKB(`<span class="info-tag">TELL</span> B${pos} → ∨{${[...clause].join(',')}}`);
        // Each neighbor could be pit: don't mark safe
    } else {
        // No breeze → all neighbors are safe (no pit)
        for (const [nr, nc] of neighbors(r, c)) {
            const lit = `~P_${nr}_${nc}`;
            const clause = new Set([lit]);
            kb.push(clause);
            addKB(`<span class="info-tag">TELL</span> ¬B${pos} → ${lit}`);
            safeKnown.add(key(nr, nc));
        }
    }

    if (stench) {
        const nbs = neighbors(r, c);
        const clause = new Set(nbs.map(([nr, nc]) => `W_${nr}_${nc}`));
        kb.push(clause);
        addKB(`<span class="info-tag">TELL</span> S${pos} → ∨{${[...clause].join(',')}}`);
    } else {
        for (const [nr, nc] of neighbors(r, c)) {
            const lit = `~W_${nr}_${nc}`;
            const clause = new Set([lit]);
            kb.push(clause);
            addKB(`<span class="info-tag">TELL</span> ¬S${pos} → ${lit}`);
        }
    }

    // Mark cell itself safe (visited)
    kb.push(new Set([`~P_${r}_${c}`, `~W_${r}_${c}`]));
    updateMetrics();
}

// ── RESOLUTION REFUTATION ─────────────────────────────
// To PROVE α (e.g., ¬P_r_c), we add ¬α (i.e., P_r_c) to KB
// and try to derive the empty clause (contradiction).
// Returns true if α is provable (cell is safe).

function resolve(c1, c2) {
    // Find complementary literals
    for (const lit of c1) {
        const neg = lit.startsWith('~') ? lit.slice(1) : '~' + lit;
        if (c2.has(neg)) {
            // Resolve on this literal
            const resolvent = new Set([...c1, ...c2]);
            resolvent.delete(lit);
            resolvent.delete(neg);
            return resolvent; // empty set = contradiction
        }
    }
    return null; // no resolution possible
}

function resolutionRefutation(query) {
    // query = literal we want to PROVE (e.g., "~P_1_2")
    // Add negation of query to KB copy
    inferenceSteps++;
    const negQuery = query.startsWith('~') ? query.slice(1) : '~' + query;
    const clauses = kb.map(c => new Set(c));
    clauses.push(new Set([negQuery])); // add ¬α

    addResolution(`─── Prove: ${query} ───`, '#f59e0b');
    addResolution(`Added ¬(${query}) = {${negQuery}}`, '#94a3b8');

    let newClauses = [];
    const seen = new Set();
    let step = 0;

    while (true) {
        step++;
        if (step > 300) break; // safety

        // Try all pairs
        let foundNew = false;
        for (let i = 0; i < clauses.length; i++) {
            for (let j = i + 1; j < clauses.length; j++) {
                const resolvent = resolve(clauses[i], clauses[j]);
                if (resolvent === null) continue;

                // Empty clause = contradiction found!
                if (resolvent.size === 0) {
                    inferenceSteps++;
                    addResolution(`Step ${step}: □ (empty clause) — CONTRADICTION!`, '#22c55e');
                    addResolution(`✓ PROVED: ${query}`, '#22c55e');
                    updateMetrics();
                    return true;
                }

                const sig = [...resolvent].sort().join('|');
                if (!seen.has(sig)) {
                    seen.add(sig);
                    newClauses.push(resolvent);
                    addResolution(`Step ${step}: {${[...resolvent].join(',')}}`, '#7dd3fc');
                    inferenceSteps++;
                    updateMetrics();
                }
            }
        }

        if (newClauses.length === 0) break;
        clauses.push(...newClauses);
        newClauses = [];
    }

    addResolution(`✗ Cannot prove: ${query}`, '#ef4444');
    updateMetrics();
    return false;
}

// ── ASK SAFETY ─────────────────────────────────────────
function isSafe(r, c) {
    if (safeKnown.has(key(r, c))) return true;
    if (dangerKnown.has(key(r, c))) return false;

    // Ask KB: is ¬Pit AND ¬Wumpus provable?
    const noPit = resolutionRefutation(`~P_${r}_${c}`);
    const noWumpus = resolutionRefutation(`~W_${r}_${c}`);

    if (noPit && noWumpus) {
        safeKnown.add(key(r, c));
        addStatus(`✅ Inferred SAFE: (${r + 1},${c + 1})`, '#22c55e');
        return true;
    }
    return false;
}

// ── AGENT STEP ─────────────────────────────────────────
function stepAgent() {
    if (!gameActive || !agent.alive) return;

    const { r, c } = agent;
    const nbs = neighbors(r, c);

    // 1. Find unvisited safe neighbors
    let candidates = nbs.filter(([nr, nc]) =>
        !visited.has(key(nr, nc)) && isSafe(nr, nc)
    );

    // 2. If none, find any unvisited safe cell reachable
    if (candidates.length === 0) {
        for (let tr = 0; tr < ROWS; tr++)
            for (let tc = 0; tc < COLS; tc++)
                if (!visited.has(key(tr, tc)) && isSafe(tr, tc))
                    candidates.push([tr, tc]);
    }

    // 3. If still none, try unvisited unknown neighbors (risk)
    if (candidates.length === 0) {
        const unvisitedNbs = nbs.filter(([nr, nc]) => !visited.has(key(nr, nc)) && !dangerKnown.has(key(nr, nc)));
        if (unvisitedNbs.length > 0) {
            candidates = [unvisitedNbs[0]];
            addStatus('⚠ No safe move found — taking risk!', '#f59e0b');
        }
    }

    // 4. Nothing left
    if (candidates.length === 0) {
        addStatus('🏁 Agent has explored all reachable safe cells.', '#00d4ff');
        gameActive = false;
        showOverlay('🏁 Exploration Complete', 'Agent has covered all safely reachable cells.');
        return;
    }

    // Choose closest candidate (Manhattan distance)
    candidates.sort(([ar, ac], [br, bc]) =>
        (Math.abs(ar - r) + Math.abs(ac - c)) - (Math.abs(br - r) + Math.abs(bc - c))
    );

    // Move toward target (one step at a time via BFS path)
    const target = candidates[0];
    const path = bfsPath(r, c, target[0], target[1]);

    if (path && path.length > 1) {
        const [nr, nc] = path[1];
        agent.r = nr;
        agent.c = nc;
        agentMoves++;
        addStatus(`🤖 Move ${agentMoves}: (${r + 1},${c + 1}) → (${nr + 1},${nc + 1})`, '#94a3b8');
        visitCell(nr, nc);
    }

    renderGrid();
    updateMetrics();
}

// BFS to find shortest path through safe/visited cells
function bfsPath(sr, sc, er, ec) {
    if (sr === er && sc === ec) return [[sr, sc]];
    const queue = [[[sr, sc]]];
    const seen = new Set([key(sr, sc)]);

    while (queue.length) {
        const path = queue.shift();
        const [r, c] = path[path.length - 1];
        for (const [nr, nc] of neighbors(r, c)) {
            const k = key(nr, nc);
            if (seen.has(k)) continue;
            if (!visited.has(k) && !safeKnown.has(k)) continue; // only through safe
            seen.add(k);
            const newPath = [...path, [nr, nc]];
            if (nr === er && nc === ec) return newPath;
            queue.push(newPath);
        }
    }
    // Fallback: allow direct neighbor even if not known safe
    return [[sr, sc], [er, ec]];
}

// ── AUTO RUN ───────────────────────────────────────────
function autoRun() {
    if (autoTimer) return;
    autoTimer = setInterval(() => {
        if (!gameActive) { stopAuto(); return; }
        stepAgent();
    }, 700);
}
function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}

// ── RENDER GRID ────────────────────────────────────────
function renderGrid() {
    const grid = document.getElementById('grid');
    grid.style.gridTemplateColumns = `repeat(${COLS}, 72px)`;
    grid.innerHTML = '';

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = world[r][c];
            const k = key(r, c);
            const div = document.createElement('div');
            div.className = 'cell';

            // Color logic (assignment spec)
            if (dangerKnown.has(k) || (visited.has(k) && (cell.pit || cell.wumpus))) {
                div.classList.add('danger');
            } else if (visited.has(k)) {
                div.classList.add('safe');
            } else if (safeKnown.has(k)) {
                div.classList.add('visited'); // inferred safe = blue
            } else {
                div.classList.add('unknown');
            }

            // Label
            const lbl = document.createElement('div');
            lbl.className = 'cell-label';
            lbl.textContent = `${r + 1},${c + 1}`;
            div.appendChild(lbl);

            // Icons
            let icons = '';
            const isAgent = agent.r === r && agent.c === c;
            const isVisited = visited.has(k);

            if (isAgent) icons += '<span class="agent-blink">🤖</span>';

            // Only reveal hazards if visited or dead
            if (isVisited || !agent.alive) {
                if (cell.pit) icons += '🌀';
                if (cell.wumpus) icons += '👹';
                if (cell.gold) icons += '🏆';
            }

            // Show percept clues if visited
            if (isVisited && !cell.pit && !cell.wumpus) {
                if (cell.breeze) icons += '💨';
                if (cell.stench) icons += '💀';
            }

            const iconDiv = document.createElement('div');
            iconDiv.className = 'cell-icons';
            iconDiv.innerHTML = icons;
            div.appendChild(iconDiv);

            grid.appendChild(div);
        }
    }
}

// ── OVERLAY ────────────────────────────────────────────
function showOverlay(title, msg) {
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-msg').textContent = msg;
    document.getElementById('overlay').classList.add('show');
}

// ── BOOT ───────────────────────────────────────────────
initGame();