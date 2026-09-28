# Safe Safar — Multi-Agent Air Traffic Collision Avoidance & Dynamic Rerouting System

**Foundations of Artificial Intelligence (FOAI) Case Study Project**

[![Simulation](https://img.shields.io/badge/Simulation-Live%20Radar%20ATC-amber)](./safe%20safar.html)
[![AI Architecture](https://img.shields.io/badge/Architecture-Decentralized%20Multi--Agent-cyan)](./README.md)
[![Pathfinding](https://img.shields.io/badge/Algorithm-A*%20Informed%20Search-green)](./README.md)

---

## 🌟 Executive Summary & Real-World Motivation

### 1. The Scale of Global Air Traffic
Modern air travel operates at an extraordinary scale:
- **105,000+ commercial flights operate daily** worldwide (~39.8 million scheduled flights annually).
- **20,000+ aircraft aloft simultaneously** during peak congested hours across 3,983 airports globally.

### 2. The Growing Risk of Collisions & Near-Misses
With airspace reaching peak density, centralized human air traffic control is under acute strain:
- **1,757 FAA runway incursions & near-misses** were recorded in 2024 alone.
- **Haneda Airport Collision (Jan 2024):** Airbus A350 collided with a Coast Guard aircraft during an understaffed holiday period.
- **Root Cause Analysis (85-incident study):** The leading causes of unsafe aviation incidents were **improper allocation of aircraft spacing (30.5%)**, **failure to intervene in time (28.4%)**, and **improper transfer of control (27.8%)**.

$$\text{Growing Air Traffic} \longrightarrow \text{Denser Airspace} \longrightarrow \text{Human Controller Overload} \longrightarrow \mathbf{\text{Rising Collision Risk}}$$

**Safe Safar** resolves this bottleneck by shifting decision-making from a single overloaded centralized controller to a **decentralized, cooperative multi-agent system** where each aircraft autonomously senses, predicts, and negotiates conflict-free routes.

---

## 📋 Formal Project Definition

> **Safe Safar** is a Multi-Agent Air Traffic Collision Avoidance and Efficient Dynamic Rerouting System in which autonomous aircraft agents operate within a shared, dynamic airspace. Each agent independently perceives nearby aircraft and environmental conditions, detects potential trajectory conflicts, and uses informed search ($A^*$) and rule-based reasoning to select safe and efficient actions. When a collision risk is identified, affected agents coordinate and dynamically replan their routes while minimizing additional distance, fuel consumption, and flight delay.

$$\mathbf{\text{Autonomous Closed-Loop:}}\quad \text{Observe} \longrightarrow \text{Detect Conflict} \longrightarrow \text{Reason} \longrightarrow A^* \text{ Reroute} \longrightarrow \text{Coordinate} \longrightarrow \text{Act} \longrightarrow \text{Re-observe} \longrightarrow \text{Replan}$$

---

## 🧠 AI Agent Formulation (PEAS)

| Component | Description |
|---|---|
| **Performance Measure** | Zero collisions, enforce minimum safe separation ($>36\,\text{NM}$ / vertical $\Delta\text{FL} \ge 20$), minimize fuel burn, minimize detour distance and delay, reach assigned destination safely. |
| **Environment** | Dynamic continuous 2D/flight-level airspace graph with waypoints, variable traffic density, and active flight paths. |
| **Actuators** | Waypoint heading vector changes, speed throttling, flight level / altitude adjustment (e.g. $\text{FL}340 \to \text{FL}360$), dynamic $A^*$ replanning, and holding pattern execution. |
| **Sensors** | Internal telemetry (position, velocity, remaining fuel, assigned destination) and radar transponder sensing nearby aircraft positions, headings, speeds, and flight levels. |

### Objective Cost Function

$$\text{Cost} = (\text{CollisionRisk} \times \lambda_{\text{penalty}}) + w_d \cdot \text{Distance} + w_f \cdot \text{Fuel} + w_t \cdot \text{Delay}$$

*The collision risk penalty term dominates all others ($\lambda_{\text{penalty}} \gg w$), guaranteeing that an agent never selects an unsafe shortcut for marginal fuel or time savings.*

---

## 🌐 Environment Properties

1. **Multi-Agent:** Many aircraft act concurrently; one agent's reroute alters the conflict landscape for all other aircraft.
2. **Dynamic:** The airspace state continuously changes while agents calculate actions.
3. **Partially Observable:** Agents sense surrounding traffic within their forward radar horizon rather than an omniscient global state.
4. **Sequential:** Current route choices directly compound into downstream waypoint congestion.
5. **Stochastic:** Traffic velocities, flight levels, and fuel reserves vary dynamically.
6. **Cooperative / Mixed-Motive:** Shared imperative for absolute collision avoidance coupled with individual route efficiency optimization.

---

## 🔄 The 5 Core Conflict Resolution Cases

- **Case A (Pairwise Conflict):** Lower-priority aircraft reroutes around the predicted conflict zone via penalized $A^*$ search (or changes flight level); higher-priority aircraft maintains course.
- **Case B (3+ Aircraft Intersection Congestion):** Conflicted aircraft form a cluster and sort by priority score (fuel urgency + flight weight). Highest priority holds course; subsequent aircraft sequentially reroute around all higher-priority committed paths.
- **Case C (No Safe Alternative Route Exists):** If all alternative graph paths cross active conflict hazards, the aircraft enters a *Holding Pattern* (throttles speed to loiter safely) and retries pathfinding next cycle.
- **Case D (Deterministic Priority Tie-Breaking):** If two conflicting aircraft possess identical priority scores, the conflict is deterministically broken by aircraft ID (lower ID yields), eliminating deadlock.
- **Case E (Cascading Conflict Prevention):** A rerouted aircraft immediately runs forward conflict checks against all other airspace traffic before committing, looping until the airspace state stabilizes.


---

## 🚀 How to Run the Live Simulator

1. Clone this repository:
   ```bash
   git clone https://github.com/Rithvikmukka/Safe-Safar---Multi-agent-air-traffic-collision-and-avoidance-system.git
   ```
2. Double-click or open [`safe safar.html`](./safe%20safar.html) directly in any modern browser (Chrome, Edge, Firefox, Safari).
3. **Interactive Demo Buttons:**
   - `+ Add Flight`: Spawns autonomous aircraft with randomized routes, speeds, and flight levels.
   - `⚡ Trigger Head-On (Case A)`: Spawns 2 aircraft on a direct collision course to demonstrate instantaneous $A^*$ avoidance.
   - `⚡ Trigger 3-Way Congestion (Case B)`: Spawns 3 converging aircraft to demonstrate priority sorting and multi-agent cascading resolution.
   - `0.5× / 1× / 2× / 4×`: Simulation speed multiplier.
   - Click any aircraft on the radar to open the real-time **Telemetry & Parameters Drawer**.
