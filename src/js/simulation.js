    (function () {
      "use strict";

      /* ============================================================
         1. GRAPH SETUP â€” AERONAUTICAL NAVIGATION FIXES & AIRWAYS
      ============================================================ */
      const LW = 1000, LH = 600;
      const COLS = 11, ROWS = 7;
      const cellW = LW / COLS, cellH = LH / ROWS;

      function seededRand(seed) {
        let s = seed;
        return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      }
      const rnd = seededRand(1337);

      const FIX_NAMES = [
        "KODEX", "ELKEY", "NAVIG", "VAPOR", "ALPHA", "MERIT", "DELTA", "ORION", "BRAVO", "ZULU", "TANGO",
        "SIERA", "HAWKE", "RADAR", "OMEGA", "VECTR", "FLITE", "CHRLY", "INDIA", "CORAL", "NEXUS", "ROTOR",
        "SONIC", "GLIDE", "BEACN", "STORM", "SWIFT", "EMBER", "VALOR", "TITAN", "SOLAR", "LUNAR", "VORTX",
        "AEROX", "STEER", "DRIFT", "PIVOT", "ASCND", "ROUTE", "PILOT", "RADIX", "POLAR", "CEDAR", "FLINT",
        "RIDGE", "VALEY", "CREEK", "PEAK", "SUMMT", "FORST", "RIVIX", "CANYN", "BLUFF", "DUNEX", "HAVEN",
        "SHORE", "HARBR", "BAYOU", "ISLND", "ATOLS", "REEFX", "COAST", "PORTS", "METRO", "URBAN", "CIVIC",
        "TOWER", "DEPOT", "UNION", "CENTX", "CROSS", "JUNCT", "INTER", "SPLIT", "FORKX", "MERGE", "BOUND"
      ];

      const nodes = [];
      let fixIndex = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const jx = (rnd() - 0.5) * cellW * 0.52;
          const jy = (rnd() - 0.5) * cellH * 0.52;
          const x = c * cellW + cellW / 2 + jx;
          const y = r * cellH + cellH / 2 + jy;
          const isBorder = (c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1);
          
          let name = "";
          if (c === 0) name = "GATE-W" + r;
          else if (c === COLS - 1) name = "GATE-E" + r;
          else if (r === 0) name = "GATE-N" + c;
          else if (r === ROWS - 1) name = "GATE-S" + c;
          else name = FIX_NAMES[fixIndex++ % FIX_NAMES.length];

          nodes.push({ idx: nodes.length, c, r, x, y, isBorder, name });
        }
      }
      function nodeIndex(c, r) { return r * COLS + c; }

      const adj = nodes.map(() => []);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const a = nodeIndex(c, r);
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nc = c + dc, nr = r + dr;
              if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
              const b = nodeIndex(nc, nr);
              const distance = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
              adj[a].push({ to: b, cost: distance });
            }
          }
        }
      }
      const borderNodes = nodes.filter(n => n.isBorder);

      function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

      function nearestNode(pos) {
        let best = 0, bd = Infinity;
        for (const n of nodes) { const d = dist(n, pos); if (d < bd) { bd = d; best = n.idx; } }
        return best;
      }

      /* A* Search with Admissible Euclidean Heuristic and Dynamic Penalty Field */
      function astar(startIdx, goalIdx, penaltyFn) {
        penaltyFn = penaltyFn || (() => 0);
        const open = new Set([startIdx]);
        const cameFrom = {};
        const g = {}; g[startIdx] = 0;
        const f = {}; f[startIdx] = dist(nodes[startIdx], nodes[goalIdx]);
        const closed = new Set();

        while (open.size) {
          let current = null, bestF = Infinity;
          for (const n of open) { if ((f[n] ?? Infinity) < bestF) { bestF = f[n]; current = n; } }
          if (current === goalIdx) {
            const path = [current];
            while (cameFrom[current] !== undefined) { current = cameFrom[current]; path.push(current); }
            path.reverse();
            return path.map(i => ({ x: nodes[i].x, y: nodes[i].y, idx: i, name: nodes[i].name }));
          }
          open.delete(current); closed.add(current);
          for (const edge of adj[current]) {
            if (closed.has(edge.to)) continue;
            const tentative = g[current] + edge.cost + penaltyFn(edge.to);
            if (tentative < (g[edge.to] ?? Infinity)) {
              cameFrom[edge.to] = current;
              g[edge.to] = tentative;
              f[edge.to] = tentative + dist(nodes[edge.to], nodes[goalIdx]);
              open.add(edge.to);
            }
          }
        }
        return null;
      }

      /* ============================================================
         2. MULTI-AGENT STATE & RECORDERS
      ============================================================ */
      let aircraft = [];
      let nextId = 1;
      let running = true;
      let simSpeed = 1;
      let resolvedCount = 0;
      const SAFETY_RADIUS = 34; // NM minimum separation
      const SENSOR_HORIZON = 165; // Pixels / radar forward perception range (~165 NM)
      const LOOKAHEAD_SAMPLES = [0, 2, 4, 6, 8];
      const PENALTY_RADIUS = 95;
      const colors = ['#4FD1E8', '#F5A623', '#B18CFF', '#4ADE80', '#FB6B6B', '#7DD3FC', '#FDBA74', '#A78BFA'];

      // Active P2P Negotiations & Collisions for visual rendering
      let activeP2PInteractions = []; // { aId, bId, point, t, winnerId, yieldingId, expiresAt }

      // Layer Toggles
      let showFixNames = true;
      let showSensorCones = true;
      let showP2PBeams = true;
      let showGhostPaths = true;

      function logP2P(msg, cls) {
        const el = document.getElementById('logList');
        const line = document.createElement('div');
        line.className = 'log-line' + (cls ? (' ' + cls) : '');
        const now = new Date();
        const t = now.toLocaleTimeString([], { hour12: false });
        line.innerHTML = '<span class="t">' + t + '</span>' + msg;
        el.prepend(line);
        while (el.children.length > 50) el.removeChild(el.lastChild);
      }

      function randRange(a, b) { return a + Math.random() * (b - a); }

      function pathLength(pts) {
        let d = 0;
        for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
        return d;
      }

      function priorityScore(ac) {
        const fuelUrgency = (1 - ac.fuel / ac.fuelMax) * 60; // Low fuel -> higher urgency
        return fuelUrgency + ac.priorityWeight * 0.4;
      }

      function createAgent(startIdx, destIdx, customProps = {}) {
        const path = astar(startIdx, destIdx);
        if (!path) return null;

        const id = nextId++;
        const fuel = customProps.fuel ?? Math.round(randRange(600, 1900));
        const ac = {
          id,
          color: colors[(id - 1) % colors.length],
          pos: { x: path[0].x, y: path[0].y },
          heading: Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x),
          queue: path.slice(1),
          fullPath: path.slice(),
          ghostPath: null,
          ghostUntil: 0,
          startNode: startIdx,
          destNode: destIdx,
          startFix: nodes[startIdx].name,
          destFix: nodes[destIdx].name,
          speed: customProps.speed ?? Math.round(randRange(35, 65)),
          fuel: fuel,
          fuelMax: fuel,
          fuelCostWeight: customProps.fuelCostWeight ?? Math.round(randRange(20, 80)),
          delayCostWeight: customProps.delayCostWeight ?? Math.round(randRange(20, 80)),
          priorityWeight: customProps.priorityWeight ?? Math.round(randRange(15, 85)),
          altitude: customProps.altitude ?? (Math.round(randRange(28, 40)) * 1000),
          status: 'cruising',
          holdTimer: 0,
          distance: pathLength(path),
          landed: false,
          ...customProps
        };
        aircraft.push(ac);
        logP2P(`Agent <b style="color:${ac.color}">#${id}</b> departed ${ac.startFix} â†’ ${ac.destFix} (${Math.round(ac.distance)} NM).`, 'reroute');
        renderFleetList();
        updateStats();
        return ac;
      }

      function spawnRandomAgent() {
        const startNode = borderNodes[Math.floor(Math.random() * borderNodes.length)];
        const candidates = borderNodes
          .filter(n => n.idx !== startNode.idx)
          .map(n => ({ n, d: dist(n, startNode) }))
          .sort((a, b) => b.d - a.d)
          .slice(0, Math.max(4, Math.floor(borderNodes.length * 0.4)));
        const destNode = candidates[Math.floor(Math.random() * candidates.length)].n;
        return createAgent(startNode.idx, destNode.idx);
      }

      /* ============================================================
         3. DEMONSTRATION PRESETS (CASE A, B, C, D)
      ============================================================ */
      function triggerCaseA() {
        // Pairwise Head-On Conflict
        aircraft = [];
        activeP2PInteractions = [];
        resolvedCount = 0;
        
        // Pick western gate and eastern gate on the middle row
        const midRow = Math.floor(ROWS / 2);
        const startW = nodeIndex(0, midRow);
        const startE = nodeIndex(COLS - 1, midRow);

        // Plane 1: Eastbound, lower fuel (higher priority)
        const ac1 = createAgent(startW, startE, {
          speed: 46,
          fuel: 380,
          fuelMax: 1800,
          priorityWeight: 80,
          altitude: 34000
        });

        // Plane 2: Westbound, full fuel (lower priority -> yields)
        const ac2 = createAgent(startE, startW, {
          speed: 46,
          fuel: 1750,
          fuelMax: 1800,
          priorityWeight: 30,
          altitude: 34000
        });

        logP2P(`ðŸŽ¯ <b>CASE A (HEAD-ON):</b> Reciprocal convergence between Agent #${ac1.id} & #${ac2.id}.`, 'conflict');
      }

      function triggerCaseB() {
        // 3-Way Sector Congestion
        aircraft = [];
        activeP2PInteractions = [];
        resolvedCount = 0;

        const centerIdx = nodeIndex(Math.floor(COLS / 2), Math.floor(ROWS / 2));
        const centerNode = nodes[centerIdx];

        // 3 distinct gates converging towards the center
        const gate1 = nodeIndex(0, 1);
        const dest1 = nodeIndex(COLS - 1, ROWS - 2);

        const gate2 = nodeIndex(COLS - 1, 1);
        const dest2 = nodeIndex(0, ROWS - 2);

        const gate3 = nodeIndex(Math.floor(COLS / 2), 0);
        const dest3 = nodeIndex(Math.floor(COLS / 2), ROWS - 1);

        const ac1 = createAgent(gate1, dest1, { speed: 45, fuel: 320, fuelMax: 1600, priorityWeight: 85 });
        const ac2 = createAgent(gate2, dest2, { speed: 45, fuel: 900, fuelMax: 1600, priorityWeight: 50 });
        const ac3 = createAgent(gate3, dest3, { speed: 45, fuel: 1500, fuelMax: 1600, priorityWeight: 20 });

        logP2P(`ðŸŒ <b>CASE B (3-WAY CONGESTION):</b> Multi-agent convergence towards FIX '${centerNode.name}'.`, 'conflict');
      }

      function triggerCaseC() {
        // Natural Multi-Agent Holding Pattern Simulation
        aircraft = [];
        activeP2PInteractions = [];
        resolvedCount = 0;

        // Crossing priority convoy down central airway corridor (col 5 & 6)
        // Agent 1: Southbound down central spine fixes, critical fuel (Score ~87)
        const ac1 = createAgent(nodeIndex(5, 0), nodeIndex(5, 6), {
          speed: 45,
          fuel: 260,
          fuelMax: 1800,
          priorityWeight: 90,
          altitude: 35000
        });

        // Agent 2: Crossing through central airway corridor, low fuel (Score ~81)
        const ac2 = createAgent(nodeIndex(6, 0), nodeIndex(4, 6), {
          speed: 41.5,
          fuel: 320,
          fuelMax: 1800,
          priorityWeight: 80,
          altitude: 35000
        });

        // Agent 3: Arriving eastbound flight with full fuel reserves (Score ~6, lowest priority)
        // Must yield, but all forward corridor exits are blocked by Agents 1 & 2 -> naturally holds over waypoint fix!
        const ac3 = createAgent(nodeIndex(2, 3), nodeIndex(10, 3), {
          speed: 45,
          fuel: 1800,
          fuelMax: 1800,
          priorityWeight: 15,
          altitude: 33000
        });

        // Ambient Agent 4: Transiting southern airway safely to show sector density
        const ac4 = createAgent(nodeIndex(0, 5), nodeIndex(10, 5), {
          speed: 38,
          fuel: 950,
          fuelMax: 1500,
          priorityWeight: 50,
          altitude: 31000
        });

        logP2P(`â³ <b>CASE C (NATURAL HOLDING PATTERN):</b> 4 flights aloft. Priority convoy (#${ac1.id} & #${ac2.id}) blocks central fixes â€” Agent #${ac3.id} evaluates alternative graph routes.`, 'holding');
      }

      function triggerCaseD() {
        // Deterministic Tie-Break (Equal Priorities)
        aircraft = [];
        activeP2PInteractions = [];

        const midRow = Math.floor(ROWS / 2);
        const startW = nodeIndex(0, midRow);
        const startE = nodeIndex(COLS - 1, midRow);

        // Identical fuel and priority weights
        const ac1 = createAgent(startW, startE, { speed: 45, fuel: 1000, fuelMax: 1000, priorityWeight: 50 });
        const ac2 = createAgent(startE, startW, { speed: 45, fuel: 1000, fuelMax: 1000, priorityWeight: 50 });

        logP2P(`âš–ï¸ <b>CASE D (TIE-BREAK):</b> Identical priority scores (${priorityScore(ac1).toFixed(1)}). Tie broken deterministically by ID (#${Math.min(ac1.id, ac2.id)} yields).`, 'conflict');
      }

      /* Forward Trajectory Projection */
      function predictPosition(ac, tSec) {
        if (ac.status === 'holding') {
          const anchor = ac.holdAnchor || ac.pos;
          return { pos: { x: anchor.x, y: anchor.y }, landed: false };
        }
        let remaining = ac.speed * simSpeed * tSec;
        let p = { x: ac.pos.x, y: ac.pos.y };
        for (let i = 0; i < ac.queue.length; i++) {
          const target = ac.queue[i];
          const d = dist(p, target);
          if (d <= remaining) { remaining -= d; p = { x: target.x, y: target.y }; }
          else {
            const t = d === 0 ? 0 : remaining / d;
            p = { x: p.x + (target.x - p.x) * t, y: p.y + (target.y - p.y) * t };
            return { pos: p, landed: false };
          }
        }
        return { pos: p, landed: true };
      }

      function normalizeAngle(a) {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
      }

      /* Strict Radar Sensing: Aircraft only detect each other when their radar cones reach or overlap */
      function canSenseEachOther(a, b) {
        const d = dist(a.pos, b.pos);
        if (d <= SAFETY_RADIUS * 1.5) return true;

        const fovHalf = (Math.PI * 0.4) / 2; // half of radar beam FOV (36 deg, exactly matching canvas arc)
        const R = SENSOR_HORIZON; // 165 NM

        // Angle from A to B relative to A's heading
        const angleAToB = Math.atan2(b.pos.y - a.pos.y, b.pos.x - a.pos.x);
        const diffA = Math.abs(normalizeAngle(angleAToB - a.heading));

        // Angle from B to A relative to B's heading
        const angleBToA = Math.atan2(a.pos.y - b.pos.y, a.pos.x - b.pos.x);
        const diffB = Math.abs(normalizeAngle(angleBToA - b.heading));

        // 1. Target aircraft is physically within the illuminated radar cone of the other
        if (d <= R) {
          if (diffA <= fovHalf || diffB <= fovHalf) return true;
        }

        // 2. Head-on or crossing: the forward radar beams point towards each other and actually touch/overlap
        if (d <= R * 2) {
          if (diffA <= fovHalf && diffB <= fovHalf) {
            const tipA = { x: a.pos.x + Math.cos(a.heading) * R, y: a.pos.y + Math.sin(a.heading) * R };
            const tipB = { x: b.pos.x + Math.cos(b.heading) * R, y: b.pos.y + Math.sin(b.heading) * R };
            if (dist(tipA, b.pos) <= R || dist(tipB, a.pos) <= R || dist(tipA, tipB) <= R * 0.5) {
              return true;
            }
          }
        }

        return false;
      }

      /* Conflict Detection â€” strictly enforces radar sensing boundary */
      function detectConflicts(list) {
        const pairs = [];
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i], b = list[j];
            if (a.status === 'landed' || b.status === 'landed') continue;

            // STRICT RADAR SENSING: planes only detect each other when radar ranges actually touch/overlap!
            if (!canSenseEachOther(a, b)) continue;

            for (const t of LOOKAHEAD_SAMPLES) {
              const pa = predictPosition(a, t);
              const pb = predictPosition(b, t);
              if (pa.landed || pb.landed) continue;
              if (dist(pa.pos, pb.pos) < SAFETY_RADIUS) {
                pairs.push({ a, b, t, point: { x: (pa.pos.x + pb.pos.x) / 2, y: (pa.pos.y + pb.pos.y) / 2 } });
                break;
              }
            }
          }
        }
        return pairs;
      }

      /* Cluster Overlapping Conflicts (Union-Find) */
      function clusterConflicts(pairs) {
        const parent = {};
        function find(x) { if (parent[x] === undefined) parent[x] = x; if (parent[x] !== x) parent[x] = find(parent[x]); return parent[x]; }
        function union(x, y) { parent[find(x)] = find(y); }
        const conflictPoints = {};
        for (const p of pairs) {
          union(p.a.id, p.b.id);
          conflictPoints[p.a.id] = conflictPoints[p.a.id] || [];
          conflictPoints[p.a.id].push(p.point);
          conflictPoints[p.b.id] = conflictPoints[p.b.id] || [];
          conflictPoints[p.b.id].push(p.point);
        }
        const groups = {};
        const ids = new Set(pairs.flatMap(p => [p.a.id, p.b.id]));
        for (const id of ids) {
          const root = find(id);
          groups[root] = groups[root] || [];
          const ac = aircraft.find(x => x.id === id);
          if (ac) groups[root].push(ac);
        }
        return { clusters: Object.values(groups), conflictPoints };
      }

      /* Local A* Replanning Around Hazard Points */
      function tryReroute(ac, avoidPoints) {
        const startIdx = nearestNode(ac.pos);
        const penaltyFn = (nodeIdx) => {
          let penalty = 0;
          const n = nodes[nodeIdx];
          for (const pt of avoidPoints) {
            const d = dist(n, pt);
            if (d < PENALTY_RADIUS) penalty += (PENALTY_RADIUS - d) * 14;
          }
          return penalty;
        };
        const newPath = astar(startIdx, ac.destNode, penaltyFn);
        if (!newPath || newPath.length < 1) return false;

        // Verify path clears safety buffer
        for (const seg of newPath) {
          for (const pt of avoidPoints) {
            if (dist(seg, pt) < SAFETY_RADIUS * 0.92) return false;
          }
        }

        // Rational Multi-Agent Rule: If detour adds excessive distance (>35 NM),
        // holding over the fix at holding speed is safer and burns far less fuel.
        const currentDirectDist = ac.queue.length > 0 ? pathLength([ac.pos, ...ac.queue]) : dist(ac.pos, nodes[ac.destNode]);
        const detourAdd = pathLength(newPath) - currentDirectDist;
        if (detourAdd > 35) {
          return false; // Trigger holding pattern
        }

        // Store old path as Ghost Path for 5 seconds comparison
        ac.ghostPath = ac.fullPath.slice();
        ac.ghostUntil = performance.now() + 5000;

        ac.queue = newPath;
        ac.fullPath = [{ x: ac.pos.x, y: ac.pos.y }, ...newPath];
        ac.distance = pathLength(ac.fullPath);
        return true;
      }

      /* Peer-to-Peer Multi-Agent Conflict Resolution */
      function resolveConflicts() {
        for (let pass = 0; pass < 2; pass++) {
          const active = aircraft.filter(a => a.status !== 'landed');
          const pairs = detectConflicts(active);
          if (pairs.length === 0) {
            for (const a of active) {
              if (a.status === 'conflict_detected') a.status = 'cruising';
              if (a.status === 'holding') {
                if (!a.minHoldUntil || performance.now() >= a.minHoldUntil) {
                  logP2P(`âœ… <b>HOLD CLEARED:</b> Agent #${a.id} crossing traffic cleared â€” resuming cruise to ${a.destFix}.`, 'reroute');
                  showNegotiationBanner(`HOLD CLEARED: Agent #${a.id} corridor clear â€” resuming cruise to ${a.destFix}`);
                  a.status = 'cruising';
                  a.holdAnchor = null;
                  a.holdAngle = null;
                  a.minHoldUntil = 0;
                }
              }
            }
            continue;
          }

          const { clusters, conflictPoints } = clusterConflicts(pairs);

          for (const cluster of clusters) {
            cluster.sort((x, y) => {
              const px = priorityScore(x), py = priorityScore(y);
              if (Math.abs(px - py) < 0.6) return x.id - y.id; // Deterministic tie-break by ID
              return py - px;
            });

            const committedPaths = [];
            cluster.forEach((ac, idx) => {
              if (idx === 0) {
                // Highest priority agent holds course
                ac.status = ac.status === 'holding' ? ac.status : 'cruising';
                committedPaths.push(...(conflictPoints[ac.id] || []));
                return;
              }

              const avoid = [...(conflictPoints[ac.id] || []), ...committedPaths];
              const ok = tryReroute(ac, avoid);
              const opponent = cluster[0];

              // Record P2P interaction for canvas drawing
              const cp = conflictPoints[ac.id] ? conflictPoints[ac.id][0] : ac.pos;
              activeP2PInteractions.push({
                aId: opponent.id,
                bId: ac.id,
                point: cp,
                winnerId: opponent.id,
                yieldingId: ac.id,
                expiresAt: performance.now() + 3200
              });

              showNegotiationBanner(`P2P COMM: Agent #${opponent.id} (Priority ${priorityScore(opponent).toFixed(1)}) maintains Â· Agent #${ac.id} yields`);

              if (ok) {
                if (ac.status !== 'rerouting') {
                  logP2P(`âš ï¸ <b>P2P NEGOTIATION:</b> #${ac.id} (Score: ${priorityScore(ac).toFixed(1)}) yields to #${opponent.id} (Score: ${priorityScore(opponent).toFixed(1)}).`, 'p2p');
                  logP2P(`ðŸ§­ <b>LOCAL A* REPLAN:</b> #${ac.id} new detour computed (+${Math.round(ac.distance)} NM).`, 'reroute');
                  resolvedCount++;
                  document.getElementById('statResolved').textContent = resolvedCount;
                }
                ac.status = 'rerouting';
                ac.holdTimer = 0;
                committedPaths.push(...avoid);
              } else {
                if (ac.status !== 'holding') {
                  const nearIdx = nearestNode(ac.pos);
                  const fix = nodes[nearIdx];
                  ac.holdAnchor = { x: fix.x, y: fix.y };
                  ac.holdAngle = ac.heading;
                  ac.minHoldUntil = performance.now() + 4200;
                  logP2P(`â›” Agent #${ac.id} all exits blocked by crossing traffic â€” entering HOLDING PATTERN at fix ${fix.name}.`, 'holding');
                  showNegotiationBanner(`HOLDING: Agent #${ac.id} loitering at ${fix.name} â€” waiting for crossing traffic clearance`);
                }
                ac.status = 'holding';
                ac.holdTimer += 1;
                committedPaths.push(...avoid);
              }
            });
          }
        }
      }

      function showNegotiationBanner(text) {
        const b = document.getElementById('p2pBanner');
        const bt = document.getElementById('p2pBannerText');
        bt.textContent = text;
        b.classList.add('show');
        clearTimeout(b._timer);
        b._timer = setTimeout(() => b.classList.remove('show'), 3000);
      }

      /* Simulation Stepper */
      function step(dtSec) {
        for (const ac of aircraft) {
          if (ac.status === 'landed') continue;

          // True Aeronautical Holding Pattern Loiter Orbit
          if (ac.status === 'holding') {
            if (!ac.holdAnchor) {
              const nearIdx = nearestNode(ac.pos);
              const fix = nodes[nearIdx];
              ac.holdAnchor = { x: fix.x, y: fix.y };
              ac.holdAngle = ac.heading;
            }
            ac.holdAngle = (ac.holdAngle || 0) + dtSec * simSpeed * 1.5;
            ac.pos = {
              x: ac.holdAnchor.x + Math.cos(ac.holdAngle) * 16,
              y: ac.holdAnchor.y + Math.sin(ac.holdAngle) * 16
            };
            ac.heading = ac.holdAngle + Math.PI / 2;
            // Fuel burn in holding pattern is throttled down to ~25% of cruise burn to conserve fuel
            ac.fuel = Math.max(0, ac.fuel - ac.speed * simSpeed * 0.04 * dtSec);
            continue;
          }

          let remaining = ac.speed * simSpeed * dtSec;
          ac.fuel = Math.max(0, ac.fuel - remaining * 0.15);

          while (remaining > 0 && ac.queue.length > 0) {
            const target = ac.queue[0];
            const d = dist(ac.pos, target);
            if (d <= remaining) {
              remaining -= d;
              ac.pos = { x: target.x, y: target.y };
              ac.queue.shift();
            } else {
              const t = d === 0 ? 0 : remaining / d;
              const nx = ac.pos.x + (target.x - ac.pos.x) * t;
              const ny = ac.pos.y + (target.y - ac.pos.y) * t;
              ac.heading = Math.atan2(target.y - ac.pos.y, target.x - ac.pos.x);
              ac.pos = { x: nx, y: ny };
              remaining = 0;
            }
          }

          if (ac.queue.length === 0 && ac.status !== 'landed') {
            ac.status = 'landed';
            logP2P(`Agent <b style="color:${ac.color}">#${ac.id}</b> reached destination ${ac.destFix} safely.`, 'landed');
          }
        }

        // Clean landed aircraft after delay
        aircraft = aircraft.filter(ac => !(ac.status === 'landed' && ac._removeAt && performance.now() > ac._removeAt));
        for (const ac of aircraft) {
          if (ac.status === 'landed' && !ac._removeAt) ac._removeAt = performance.now() + 4000;
        }

        // Prune expired P2P interaction beams
        activeP2PInteractions = activeP2PInteractions.filter(i => performance.now() < i.expiresAt);
      }

      function updateStats() {
        document.getElementById('statActive').textContent = aircraft.filter(a => a.status !== 'landed').length;
        document.getElementById('statHolding').textContent = aircraft.filter(a => a.status === 'holding').length;
        document.getElementById('fleetCount').textContent = aircraft.length + ' aircraft';
      }

      /* ============================================================
         4. CANVAS RADAR RENDERING (HIGH-DPI SUPPORTED)
      ============================================================ */
      const canvas = document.getElementById('radar');
      const ctx = canvas.getContext('2d');
      let selectedId = null;

      function resizeCanvasDPI() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      window.addEventListener('resize', resizeCanvasDPI);
      resizeCanvasDPI();

      function getCss(varName) {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      }

      function statusColor(ac) {
        switch (ac.status) {
          case 'conflict_detected': return getCss('--rose');
          case 'rerouting': return getCss('--amber');
          case 'holding': return getCss('--violet');
          case 'landed': return getCss('--green');
          default: return ac.color;
        }
      }

      function drawAirspaceGraph() {
        // Draw Sector Range Rings
        ctx.strokeStyle = "rgba(79, 209, 232, 0.05)";
        ctx.lineWidth = 1;
        const cx = LW / 2, cy = LH / 2;
        [120, 240, 360, 480].forEach(r => {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        });

        // Airway Corridors
        ctx.strokeStyle = "rgba(30, 43, 62, 0.55)";
        ctx.lineWidth = 1;
        for (let i = 0; i < nodes.length; i++) {
          for (const e of adj[i]) {
            if (e.to < i) continue;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[e.to].x, nodes[e.to].y);
            ctx.stroke();
          }
        }

        // Navigation Fixes & Gateways
        for (const n of nodes) {
          if (n.isBorder) {
            // Airspace Boundary Gate
            ctx.fillStyle = "rgba(79, 209, 232, 0.4)";
            ctx.fillRect(n.x - 3, n.y - 3, 6, 6);
          } else {
            // Aeronautical Fix (Diamond)
            ctx.fillStyle = "rgba(148, 163, 184, 0.45)";
            ctx.beginPath();
            ctx.moveTo(n.x, n.y - 3.5);
            ctx.lineTo(n.x + 3.5, n.y);
            ctx.lineTo(n.x, n.y + 3.5);
            ctx.lineTo(n.x - 3.5, n.y);
            ctx.closePath();
            ctx.fill();
          }

          if (showFixNames) {
            ctx.font = '8px "IBM Plex Mono", monospace';
            ctx.fillStyle = n.isBorder ? "rgba(79, 209, 232, 0.5)" : "rgba(100, 116, 139, 0.55)";
            ctx.fillText(n.name, n.x + 5, n.y + 3);
          }
        }
      }

      function drawP2PInteractions() {
        if (!showP2PBeams) return;

        for (const inter of activeP2PInteractions) {
          const acA = aircraft.find(a => a.id === inter.aId);
          const acB = aircraft.find(a => a.id === inter.bId);
          if (!acA || !acB) continue;

          // 1. Direct Peer-to-Peer Communication Beam
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(acA.pos.x, acA.pos.y);
          ctx.lineTo(acB.pos.x, acB.pos.y);
          ctx.strokeStyle = getCss('--amber');
          ctx.lineWidth = 1.6;
          ctx.setLineDash([6, 4]);
          ctx.stroke();

          // Laser glow
          ctx.shadowColor = getCss('--amber');
          ctx.shadowBlur = 12;
          ctx.stroke();
          ctx.restore();

          // 2. Conflict Hotspot Marker (Concentric pulsing danger ring)
          if (inter.point) {
            const pulse = 16 + 8 * Math.sin(performance.now() / 150);
            ctx.save();
            ctx.beginPath();
            ctx.arc(inter.point.x, inter.point.y, pulse, 0, Math.PI * 2);
            ctx.strokeStyle = getCss('--rose');
            ctx.lineWidth = 1.8;
            ctx.shadowColor = getCss('--rose');
            ctx.shadowBlur = 14;
            ctx.stroke();

            // Hotspot Label
            ctx.font = '9px "IBM Plex Mono", monospace';
            ctx.fillStyle = getCss('--rose');
            ctx.fillText("âš ï¸ CONFLICT HOTSPOT", inter.point.x - 45, inter.point.y - pulse - 4);
            ctx.restore();
          }
        }
      }

      /* ============================================================
         REALISTIC COMMERCIAL AIRLINER SILHOUETTE
      ============================================================ */
      function drawAirplaneSilhouette(ctx, x, y, heading, size, color, isSelected) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(heading);

        // Radar avionics glow
        ctx.shadowColor = color;
        ctx.shadowBlur = isSelected ? 18 : 8;

        // Main airframe fill and outline
        ctx.fillStyle = color;
        ctx.strokeStyle = isSelected ? "#FFFFFF" : "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 0.9;

        ctx.beginPath();
        // Nose radome
        ctx.moveTo(size * 1.45, 0);
        // Cockpit & forward right fuselage
        ctx.bezierCurveTo(size * 1.1, size * 0.22, size * 0.55, size * 0.22, size * 0.25, size * 0.22);
        // Right wing leading edge
        ctx.lineTo(size * 0.1, size * 1.35);
        // Right winglet / wing tip
        ctx.lineTo(-size * 0.15, size * 1.35);
        // Right wing trailing edge
        ctx.lineTo(-size * 0.08, size * 0.22);
        // Mid-to-rear fuselage (right)
        ctx.lineTo(-size * 0.75, size * 0.18);
        // Right horizontal stabilizer (tail wing)
        ctx.lineTo(-size * 0.9, size * 0.7);
        ctx.lineTo(-size * 1.1, size * 0.7);
        ctx.lineTo(-size * 1.0, size * 0.1);
        // Tailcone apex
        ctx.lineTo(-size * 1.3, 0);
        // Left horizontal stabilizer (tail wing)
        ctx.lineTo(-size * 1.0, -size * 0.1);
        ctx.lineTo(-size * 1.1, -size * 0.7);
        ctx.lineTo(-size * 0.9, -size * 0.7);
        // Mid-to-rear fuselage (left)
        ctx.lineTo(-size * 0.75, -size * 0.18);
        // Left wing trailing edge
        ctx.lineTo(-size * 0.08, -size * 0.22);
        // Left winglet / wing tip
        ctx.lineTo(-size * 0.15, -size * 1.35);
        // Left wing leading edge
        ctx.lineTo(size * 0.1, -size * 1.35);
        // Forward fuselage (left)
        ctx.lineTo(size * 0.25, -size * 0.22);
        ctx.bezierCurveTo(size * 0.55, -size * 0.22, size * 1.1, -size * 0.22, size * 1.45, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Under-wing twin turbofan jet engine nacelles
        ctx.fillStyle = "rgba(10, 15, 25, 0.85)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.75;
        // Right engine
        ctx.fillRect(size * 0.05, size * 0.48, size * 0.28, size * 0.15);
        ctx.strokeRect(size * 0.05, size * 0.48, size * 0.28, size * 0.15);
        // Left engine
        ctx.fillRect(size * 0.05, -size * 0.63, size * 0.28, size * 0.15);
        ctx.strokeRect(size * 0.05, -size * 0.63, size * 0.28, size * 0.15);

        // Cockpit windshield visor (high-tech glass glint)
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.ellipse(size * 0.95, 0, size * 0.16, size * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Forward velocity vector leader (dashed vector ahead of nose)
        ctx.beginPath();
        ctx.moveTo(size * 1.45, 0);
        ctx.lineTo(size * 2.6, 0);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
      }

      function drawAircraft(ac) {
        const col = statusColor(ac);
        const isSelected = (selectedId === ac.id);

        // 1. Ghost Path (Original aborted trajectory comparison)
        if (showGhostPaths && ac.ghostPath && performance.now() < ac.ghostUntil) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(ac.ghostPath[0].x, ac.ghostPath[0].y);
          for (let i = 1; i < ac.ghostPath.length; i++) ctx.lineTo(ac.ghostPath[i].x, ac.ghostPath[i].y);
          ctx.strokeStyle = "rgba(251, 107, 107, 0.4)";
          ctx.setLineDash([3, 5]);
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Aborted Hazard Cross
          const lastPt = ac.ghostPath[Math.min(2, ac.ghostPath.length - 1)];
          ctx.strokeStyle = getCss('--rose');
          ctx.beginPath();
          ctx.moveTo(lastPt.x - 5, lastPt.y - 5); ctx.lineTo(lastPt.x + 5, lastPt.y + 5);
          ctx.moveTo(lastPt.x + 5, lastPt.y - 5); ctx.lineTo(lastPt.x - 5, lastPt.y + 5);
          ctx.stroke();
          ctx.restore();
        }

        // 2. Active A* Navigational Corridor
        ctx.beginPath();
        ctx.moveTo(ac.pos.x, ac.pos.y);
        for (const p of ac.queue) ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = col;
        ctx.globalAlpha = isSelected ? 0.8 : 0.4;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = isSelected ? 2 : 1.3;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // 3. Forward Perception Horizon (Sensor Radar Arc)
        if (showSensorCones && ac.status !== 'landed') {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(ac.pos.x, ac.pos.y);
          const fov = Math.PI * 0.4; // 72-degree forward radar cone
          ctx.arc(ac.pos.x, ac.pos.y, SENSOR_HORIZON, ac.heading - fov / 2, ac.heading + fov / 2);
          ctx.closePath();
          ctx.fillStyle = isSelected ? "rgba(79, 209, 232, 0.08)" : "rgba(79, 209, 232, 0.03)";
          ctx.fill();
          ctx.strokeStyle = isSelected ? "rgba(79, 209, 232, 0.25)" : "rgba(79, 209, 232, 0.08)";
          ctx.stroke();
          ctx.restore();
        }

        // 4. Protective Separation Bubble (34 NM minimum safe separation)
        ctx.save();
        ctx.beginPath();
        ctx.arc(ac.pos.x, ac.pos.y, SAFETY_RADIUS / 2, 0, Math.PI * 2);
        ctx.strokeStyle = (ac.status === 'conflict_detected' || ac.status === 'rerouting') ? getCss('--rose') : "rgba(79, 209, 232, 0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.restore();

        // 5. Holding Pattern Loiter Ring & Fix Beacon
        if (ac.status === 'holding') {
          const anchor = ac.holdAnchor || ac.pos;
          ctx.save();
          ctx.beginPath();
          ctx.arc(anchor.x, anchor.y, 16, 0, Math.PI * 2);
          ctx.strokeStyle = getCss('--violet');
          ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 3]);
          ctx.shadowColor = getCss('--violet-glow');
          ctx.shadowBlur = 8;
          ctx.stroke();

          // Holding fix center beacon
          ctx.beginPath();
          ctx.arc(anchor.x, anchor.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = getCss('--violet');
          ctx.fill();
          ctx.restore();
        }

        // 6. Aircraft Icon (Detailed Top-Down Commercial Airliner)
        drawAirplaneSilhouette(ctx, ac.pos.x, ac.pos.y, ac.heading, 11, col, isSelected);

        // 7. Tactical Data Block (Flight Tag)
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.fillStyle = isSelected ? getCss('--cyan') : getCss('--text');
        ctx.fillText(`AGENT #${ac.id} FL${Math.round(ac.altitude / 100)}`, ac.pos.x + 18, ac.pos.y - 8);

        ctx.font = '9px "IBM Plex Mono", monospace';
        ctx.fillStyle = getCss('--text-faint');
        const speedTag = ac.status === 'holding' ? '210kt (HOLD)' : `${ac.speed}kt`;
        ctx.fillText(`${speedTag} Â· ${Math.round(ac.fuel)}kg`, ac.pos.x + 18, ac.pos.y + 4);

        // Cognitive State Tag
        ctx.fillStyle = col;
        const statusLabel = ac.status === 'holding' ? '[HOLDING PATTERN]' : `[${ac.status.replace('_', ' ').toUpperCase()}]`;
        ctx.fillText(statusLabel, ac.pos.x + 18, ac.pos.y + 15);
      }

      function render() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
        }

        ctx.save();
        ctx.scale(canvas.width / LW, canvas.height / LH);
        ctx.clearRect(0, 0, LW, LH);
        ctx.fillStyle = "#05080E";
        ctx.fillRect(0, 0, LW, LH);

        drawAirspaceGraph();
        drawP2PInteractions();
        for (const ac of aircraft) drawAircraft(ac);

        ctx.restore();
      }

      /* ============================================================
         5. MAIN SIMULATION LOOP
      ============================================================ */
      let lastTime = performance.now();
      let conflictCheckAccum = 0;

      function frame(now) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        if (running) {
          step(dt);
          conflictCheckAccum += dt;
          if (conflictCheckAccum > 0.35) {
            conflictCheckAccum = 0;
            flagPredictedConflicts();
            resolveConflicts();
            updateStats();
            renderFleetList();
          }
        }
        render();
        requestAnimationFrame(frame);
      }

      function flagPredictedConflicts() {
        const active = aircraft.filter(a => a.status !== 'landed');
        const pairs = detectConflicts(active);
        const inConflict = new Set(pairs.flatMap(p => [p.a.id, p.b.id]));
        for (const ac of active) {
          if (inConflict.has(ac.id) && ac.status === 'cruising') {
            ac.status = 'conflict_detected';
          }
        }
      }

      /* ============================================================
         6. FLEET LIST & AGENT INSPECTOR
      ============================================================ */
      function renderFleetList() {
        const list = document.getElementById('fleetList');
        if (aircraft.length === 0) {
          list.innerHTML = '<div class="fleet-empty">No aircraft aloft. Trigger a demo preset or add flights to begin.</div>';
          return;
        }
        list.innerHTML = '';
        aircraft.slice().sort((a, b) => a.id - b.id).forEach(ac => {
          const card = document.createElement('div');
          card.className = 'flight-card' + (selectedId === ac.id ? ' selected-card' : '');
          const fuelPct = Math.max(0, Math.round(100 * ac.fuel / ac.fuelMax));
          card.innerHTML = `
            <div class="row1">
              <span class="fid" style="color:${ac.color}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                AGENT #${ac.id}
              </span>
              <span class="badge ${ac.status}">${ac.status.replace('_', ' ')}</span>
            </div>
            <div class="meta">
              <span>${ac.startFix} â†’ ${ac.destFix}</span>
              <span>${ac.speed} kt</span>
              <span>FL${Math.round(ac.altitude / 100)}</span>
              <span>P:${priorityScore(ac).toFixed(0)}</span>
            </div>
            <div class="fuelbar"><i style="width:${fuelPct}%; background:${fuelPct < 25 ? 'var(--rose)' : 'var(--green)'}"></i></div>
          `;
          card.addEventListener('click', () => openDrawer(ac.id));
          list.appendChild(card);
        });
      }

      const drawer = document.getElementById('drawer');
      const backdrop = document.getElementById('drawerBackdrop');

      function openDrawer(id) {
        selectedId = id;
        const ac = aircraft.find(a => a.id === id);
        if (!ac) return;
        document.getElementById('drawerTitle').textContent = `AGENT #${id} TELEMETRY`;
        document.getElementById('cfgStatusText').textContent = ac.status.replace('_', ' ').toUpperCase();
        const b = document.getElementById('cfgStatusBadge');
        b.className = 'badge ' + ac.status; b.textContent = ac.status.replace('_', ' ');
        document.getElementById('cfgRouteWaypoints').textContent = `${ac.startFix} â†’ ${ac.destFix}`;
        document.getElementById('cfgDistance').textContent = Math.round(ac.distance) + ' NM';
        document.getElementById('cfgFuel').value = ac.fuel;
        document.getElementById('cfgFuel').max = ac.fuelMax;
        document.getElementById('cfgFuelVal').textContent = Math.round(ac.fuel) + ' kg';
        document.getElementById('cfgSpeed').value = ac.speed;
        document.getElementById('cfgSpeedVal').textContent = ac.speed + ' kt';
        document.getElementById('cfgPriority').value = ac.priorityWeight;
        document.getElementById('cfgPriorityVal').textContent = ac.priorityWeight;
        document.getElementById('cfgFuelW').value = ac.fuelCostWeight;
        document.getElementById('cfgFuelWVal').textContent = ac.fuelCostWeight;
        document.getElementById('cfgDelayW').value = ac.delayCostWeight;
        document.getElementById('cfgDelayWVal').textContent = ac.delayCostWeight;
        updatePriorityReadout(ac);
        drawer.classList.add('open'); backdrop.classList.add('open');
        renderFleetList();
      }

      function updatePriorityReadout(ac) {
        if (!ac) return;
        const fuelUrgency = (1 - ac.fuel / ac.fuelMax) * 60;
        const weightTerm = ac.priorityWeight * 0.4;
        const total = fuelUrgency + weightTerm;
        const elUrgency = document.getElementById('cfgFuelUrgencyTerm');
        if (elUrgency) elUrgency.textContent = fuelUrgency.toFixed(1) + ' pts';
        const elWeight = document.getElementById('cfgWeightTerm');
        if (elWeight) elWeight.textContent = weightTerm.toFixed(1) + ' pts';
        const elScore = document.getElementById('cfgPriorityScore');
        if (elScore) elScore.textContent = total.toFixed(1);
      }

      function closeDrawer() {
        drawer.classList.remove('open'); backdrop.classList.remove('open');
        selectedId = null;
        renderFleetList();
      }
      document.getElementById('drawerClose').addEventListener('click', closeDrawer);
      backdrop.addEventListener('click', closeDrawer);

      function bindSlider(id, prop, suffix) {
        document.getElementById(id).addEventListener('input', (e) => {
          const ac = aircraft.find(a => a.id === selectedId);
          if (!ac) return;
          const v = Number(e.target.value);
          ac[prop] = v;
          document.getElementById(id + 'Val').textContent = v + (suffix || '');
          updatePriorityReadout(ac);
        });
      }
      bindSlider('cfgFuel', 'fuel', ' kg');
      bindSlider('cfgSpeed', 'speed', ' kt');
      bindSlider('cfgPriority', 'priorityWeight', '');
      bindSlider('cfgFuelW', 'fuelCostWeight', '');
      bindSlider('cfgDelayW', 'delayCostWeight', '');

      document.getElementById('cfgRemove').addEventListener('click', () => {
        aircraft = aircraft.filter(a => a.id !== selectedId);
        closeDrawer();
        renderFleetList();
        updateStats();
      });

      // Canvas click selects nearest aircraft
      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * LW;
        const y = (e.clientY - rect.top) / rect.height * LH;
        let best = null, bd = Infinity;
        for (const ac of aircraft) {
          const d = Math.hypot(ac.pos.x - x, ac.pos.y - y);
          if (d < bd) { bd = d; best = ac; }
        }
        if (best && bd < 45) openDrawer(best.id);
      });

      /* ============================================================
         7. FULLSCREEN MODULAR CONTROLS
      ============================================================ */
      const simModule = document.getElementById('simulationModule');
      const fsBtns = [document.getElementById('fsToggleBtn1'), document.getElementById('fsToggleBtn2'), document.getElementById('launchFsHeroBtn'), document.getElementById('launchFsTopNavBtn')];

      function toggleFullscreen() {
        const isFS = simModule.classList.toggle('fullscreen-mode');
        document.body.style.overflow = isFS ? 'hidden' : '';
        document.getElementById('fsBtnText').textContent = isFS ? 'Exit Full-Screen' : 'Full-Screen';
        
        // Browser Fullscreen API support
        if (isFS && document.fullscreenEnabled && !document.fullscreenElement) {
          simModule.requestFullscreen().catch(() => {});
        } else if (!isFS && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }

        setTimeout(resizeCanvasDPI, 100);
      }

      fsBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', toggleFullscreen);
      });

      // Esc or F key handler
      window.addEventListener('keydown', (e) => {
        if (e.key === 'f' || e.key === 'F') {
          if (document.activeElement.tagName !== 'INPUT') toggleFullscreen();
        } else if (e.key === 'Escape') {
          if (simModule.classList.contains('fullscreen-mode')) toggleFullscreen();
        } else if (e.key === ' ') {
          if (document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            playBtn.click();
          }
        }
      });

      /* ============================================================
         8. SCENARIO EXPLANATION GUIDE & PRESET LISTENERS
      ============================================================ */
      const scenarioExplanations = {
        'A': {
          badge: 'Case A Active',
          theme: '',
          title: 'Pairwise Head-On Collision Course',
          desc: '<strong>Setup:</strong> 2 aircraft are placed on a reciprocal heading along the same airway.<br><strong>Decision Logic:</strong> Agent #1 has lower fuel (higher fuel urgency score), so Agent #2 yields and computes an autonomous local A* avoidance detour around the conflict point.'
        },
        'B': {
          badge: 'Case B Active',
          theme: 'cyan-theme',
          title: '3-Way Sector Congestion Convergence',
          desc: '<strong>Setup:</strong> 3 aircraft converge simultaneously on the central waypoint fix.<br><strong>Decision Logic:</strong> A peer cluster is formed and ranked by priority score (fuel urgency + flight weight). The top-ranked flight maintains its flight plan, while subsequent aircraft sequentially compute non-interfering detours.'
        },
        'C': {
          badge: 'Case C Active',
          theme: 'violet-theme',
          title: 'Natural Holding Pattern (Corridor Blocked by Priority Convoy)',
          desc: '<strong>Setup:</strong> Multiple flights are active aloft. A high-priority crossing convoy (Agents #1 & #2, low fuel) traverses the central corridor fixes right as Agent #3 (full fuel, lowest priority) arrives.<br><strong>Decision Logic:</strong> Agent #3 projects forward and determines that every alternative airway fix violates safety thresholds or demands an irrational, fuel-exhausting detour. Rather than committing to a dangerous shortcut, the rational agent switches to an autonomous holding pattern over its waypoint fix, throttling down to holding speed (210kt) to conserve fuel. Once the crossing traffic clears, it automatically resumes cruise to its destination.'
        },
        'D': {
          badge: 'Case D Active',
          theme: '',
          title: 'Deterministic Symmetry Breaking (Equal Priorities)',
          desc: '<strong>Setup:</strong> 2 aircraft meet with identical fuel reserves (1000 kg) and equal priority weights (w_p = 50).<br><strong>Decision Logic:</strong> Priority scores match exactly (P_1 = P_2). The deterministic tie-breaker takes over: the aircraft with the lower unique Flight ID yields automatically, eliminating communication deadlocks.'
        },
        'ADD': {
          badge: 'Custom Traffic Added',
          theme: 'green-theme',
          title: 'Dynamic Traffic Injection',
          desc: '<strong>Setup:</strong> A new autonomous aircraft departs from a random border waypoint.<br><strong>Decision Logic:</strong> The agent executes initial A* pathfinding and continuously broadcasts radar transponder pings, negotiating right-of-way with all aloft traffic.'
        }
      };

      function updateScenarioGuide(caseKey) {
        const info = scenarioExplanations[caseKey];
        if (!info) return;
        const box = document.getElementById('scenarioGuideBox');
        if (box) {
          box.className = 'scenario-guide-box ' + (info.theme || '');
        }
        const b = document.getElementById('guideBadge');
        if (b) b.textContent = info.badge;
        const t = document.getElementById('guideTitle');
        if (t) t.textContent = info.title;
        const d = document.getElementById('guideDesc');
        if (d) d.innerHTML = info.desc;

        const btnMap = {
          'A': 'scenarioHeadOnBtn',
          'B': 'scenarioClusterBtn',
          'C': 'scenarioHoldBtn',
          'D': 'scenarioTieBtn'
        };
        Object.entries(btnMap).forEach(([k, id]) => {
          const btn = document.getElementById(id);
          if (btn) btn.classList.toggle('active-preset', k === caseKey);
        });
      }

      document.getElementById('scenarioHeadOnBtn').addEventListener('click', () => {
        triggerCaseA();
        updateScenarioGuide('A');
      });
      document.getElementById('scenarioClusterBtn').addEventListener('click', () => {
        triggerCaseB();
        updateScenarioGuide('B');
      });
      document.getElementById('scenarioHoldBtn').addEventListener('click', () => {
        triggerCaseC();
        updateScenarioGuide('C');
      });
      document.getElementById('scenarioTieBtn').addEventListener('click', () => {
        triggerCaseD();
        updateScenarioGuide('D');
      });
      document.getElementById('addFlightBtn').addEventListener('click', () => {
        spawnRandomAgent();
        updateScenarioGuide('ADD');
      });

      const playBtn = document.getElementById('playPauseBtn');
      playBtn.addEventListener('click', () => {
        running = !running;
        playBtn.textContent = running ? 'â¸ Pause' : 'â–¶ Play';
        playBtn.classList.toggle('active', running);
        lastTime = performance.now();
      });

      document.querySelectorAll('[data-speed]').forEach(btn => {
        btn.addEventListener('click', () => {
          simSpeed = Number(btn.dataset.speed);
          document.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      // Layer Toggles
      function bindToggle(id, getter, setter) {
        const btn = document.getElementById(id);
        btn.addEventListener('click', () => {
          const val = !getter();
          setter(val);
          btn.classList.toggle('toggle-on', val);
        });
      }
      bindToggle('toggleFixNamesBtn', () => showFixNames, v => showFixNames = v);
      bindToggle('toggleSensorConesBtn', () => showSensorCones, v => showSensorCones = v);
      bindToggle('toggleP2PBeamsBtn', () => showP2PBeams, v => showP2PBeams = v);
      bindToggle('toggleGhostPathsBtn', () => showGhostPaths, v => showGhostPaths = v);

      document.getElementById('resetBtn').addEventListener('click', () => {
        aircraft = [];
        activeP2PInteractions = [];
        resolvedCount = 0;
        document.getElementById('statResolved').textContent = 0;
        document.getElementById('logList').innerHTML = '<div class="log-line"><span class="t">RESET</span>Airspace cleared. Ready for next scenario.</div>';
        renderFleetList();
        updateStats();
        closeDrawer();
      });

      /* ============================================================
         INITIALIZE
      ============================================================ */
      triggerCaseA(); // Start with Head-On demonstration scenario for immediate visual clarity
      requestAnimationFrame(frame);

    })();
