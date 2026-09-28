# Safe Safar — Multi-Agent Air Traffic Collision Avoidance System

An interactive, autonomous multi-agent simulation and case study for decentralized air traffic conflict detection and collision avoidance.

---

## 🌟 Overview

Modern airspace is dense and continually growing, channeling thousands of simultaneous flights through shared corridors and terminal approach paths. Traditional centralized air traffic management heavily depends on human radar controllers. **Safe Safar** demonstrates a decentralized, multi-agent AI approach where each aircraft acts as an autonomous agent that senses its local environment, predicts spatial-temporal conflicts in advance, and cooperatively negotiates safe reroutes using heuristic path search.

---

## 🚀 Key Features

- **Decentralized Multi-Agent Coordination:** Each flight operates independently with local sensing and autonomous decision-making.
- **Informed Search ($A^*$ Algorithm):** Dynamic waypoint graph pathfinding balancing distance, fuel consumption, delays, and collision avoidance penalties.
- **Predictive Conflict Detection:** Forward-looking trajectory projection that predicts proximity violations before they occur.
- **Priority-Based Conflict Resolution:** Deterministic negotiation rules that resolve 2-way, 3-way, and cascading multi-aircraft encounters.
- **Live Interactive Radar Simulation:** Real-time HTML5 2D Canvas radar screen with aircraft telemetry, conflict alert rings, heading vectors, flight paths, and inspector controls.
- **Zero Dependencies:** Fully self-contained single-page application built with vanilla HTML, CSS, and JavaScript.

---

## 🧠 AI Agent Formulation (PEAS)

| Component | Description |
|---|---|
| **Performance Measure** | Avoid collisions, maintain minimum safe separation ($>40\,\text{nmi}$), minimize fuel burn, minimize flight distance and arrival delay, reach assigned destination. |
| **Environment** | Dynamic, 2D continuous airspace graph with waypoints, active air traffic, and variable priorities. |
| **Actuators** | Heading adjustment, speed regulation, altitude assignment, and waypoint route replanning. |
| **Sensors** | Telemetry (position, velocity, remaining fuel), radar transponder sensing nearby aircraft positions & velocity vectors. |

### Objective Cost Function

$$\text{Cost} = (\text{CollisionRisk} \times \lambda_{\text{penalty}}) + w_d \cdot \text{Distance} + w_f \cdot \text{Fuel} + w_t \cdot \text{Delay}$$

*The collision penalty dominates all other terms, guaranteeing that an agent never selects an unsafe route for marginal fuel or time savings.*

---

## 🌐 Environment Properties

- **Multi-Agent:** Multiple aircraft concurrently make decisions affecting shared airspace.
- **Dynamic:** Airspace states continuously evolve while agents compute actions.
- **Partially Observable:** Agents sense surrounding traffic within radar range rather than omniscient global state.
- **Sequential:** Current routing choices impact downstream conflict potential.
- **Stochastic:** Velocity fluctuations and trajectory uncertainties are evaluated dynamically.
- **Cooperative / Mixed-Motive:** Shared imperative for collision avoidance coupled with individual route efficiency optimization.

---

## 🔄 Autonomous Control Loop

Every aircraft agent executes a continuous closed-loop cycle:

$$\text{Observe} \longrightarrow \text{Detect} \longrightarrow \text{Reason} \longrightarrow \text{Replan } (A^*) \longrightarrow \text{Act} \longrightarrow \text{Re-observe}$$

1. **Observe:** Sense positions, headings, and speeds of all aircraft within radar range.
2. **Detect:** Project future positions ($t + \Delta t$). Flag conflicts if predicted separation drops below safety threshold.
3. **Reason:** Determine right-of-way based on aircraft priority, remaining fuel, and deterministic tie-breaking.
4. **Replan ($A^*$):** Compute detour path around the conflict zone across the waypoint network.
5. **Act:** Update heading, speed, and follow new waypoint waypoints.

---

## 🛠️ How to Run

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Rithvikmukka/Safe-Safar---Multi-agent-air-traffic-collision-and-avoidance-system.git
   ```
2. Open [`safe safar.html`](./safe%20safar.html) directly in any modern web browser (Chrome, Firefox, Edge, Safari).
3. No build tools, Node.js, or server setup required!

---

## 📊 Simulation Controls

- **Play / Pause:** Toggle simulation clock.
- **Speed Multipliers:** Run simulation at $1\times$, $2\times$, or $4\times$ real-time speed.
- **Add Flight:** Spawn new random flights with dynamically generated origins, destinations, and priority levels.
- **Inspect Flight:** Click on any aircraft icon on the radar or in the fleet list to adjust fuel, speed, and cost weights live.
- **Reset:** Clear active airspace and reset metrics.
