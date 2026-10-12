# Safe Safar - Frequently Asked Questions (FAQ)

Here are detailed answers to common questions about the Safe Safar simulation and its implementation, explained in simple language.

---

### 1) Is decentralized actually better than centralized?
**Yes, especially at scale.** 
A centralized system (like traditional human Air Traffic Control) has a single point of failure and a massive bottleneck: a human controller can only keep track of so many planes at once. As air traffic increases, the system gets overwhelmed.
A decentralized system means every single airplane is its own "controller." Because the computational work is distributed across all the airplanes, the system can scale infinitely. A thousand planes can negotiate with each other locally without waiting for a central tower to give them permission, eliminating bottlenecks and human error.

### 2) During simulation, is there a gap of 34 nautical miles between flights at all times?
**The system actively tries to maintain it, but it's not a magic shield.**
The 34 NM distance is the **Safety Bubble**. Whenever the AI predicts that the distance between two planes will drop below 34 NM in the near future, it throws a "Conflict" alert and forces one of the planes to reroute. However, in extreme congestion (like 4 planes converging on the exact same spot), the planes might briefly get closer than 34 NM while they rapidly negotiate and execute their emergency holding patterns. 

### 3) In sensors (PEAS), is it fine if we just describe it like that or should we use definite names? (Eg: altitude sensor)
**It is perfectly fine—and actually preferred—to describe it the way it is.**
In Artificial Intelligence, the PEAS model (Performance, Environment, Actuators, Sensors) is meant to be a high-level logical framework, not a hardware manual. Saying "Internal telemetry" or "Radar Transponder" is abstract enough to capture *what* information the agent receives (position, fuel, peer locations) without getting bogged down in specific hardware names like "Pitot tubes" or "Barometric Altimeters."

### 4) What are the names given to waypoints in the graph?
The waypoints (navigational fixes) are given standard 5-letter aviation names. 
Some examples from the code include: **KODEX, ELKEY, NAVIG, VAPOR, ALPHA, BRAVO, ZULU, TANGO, RADAR, OMEGA**. 
Additionally, the entry and exit points on the edges of the map are named as "Gates" based on their direction (e.g., **GATE-N1** for North, **GATE-W3** for West).

### 5) Sometimes after the recalibration of a route due to a hazard, the flight goes one direction, then suddenly goes into another direction. Is this a rendering problem?
**No, this is not a UI glitch—it is the AI dynamically replanning!**
Because the obstacle (the other airplane) is constantly moving, the geometry of the "danger zone" is changing every fraction of a second. The AI is continuously running its A* pathfinding algorithm. If the other plane moves slightly, a path to the left might suddenly become safer or shorter than a path to the right, causing the AI to aggressively snap its route to the new optimal path. In AI terms, this is known as **dynamic path replanning** or "path thrashing."

### 6) What are all the labels/toggles in the web page? (Eg: fix names, sensor cones and others)
The simulation UI allows you to toggle different visual layers to understand what the AI is doing:
* **Fix Names:** The text labels (like KODEX or GATE-E) on the grid intersections.
* **Sensor Cones:** The transparent blue/yellow pie-slice shapes in front of the airplanes. This represents their actual forward radar field-of-view (72 degrees).
* **P2P Beams:** The flashing red/orange laser lines drawn between two airplanes. This indicates that the two planes have detected each other and are actively "talking" to negotiate who yields.
* **Ghost Paths:** The translucent dotted lines trailing off a plane. This shows the *original* optimal path the plane wanted to take before it was forced to detour.

### 7) Are all the assignments to flights wrt fuel, src, and dst point random?
**Yes, by default.** 
When you click "+ Add Custom Flight" or when the simulation generates background traffic, it uses random math to assign the start gate, destination gate, speed (35-65), altitude, and starting fuel level.
*Note:* If you click the preset scenario buttons (like "Case A: Head-On" or "Case C: Holding Pattern"), the code uses hardcoded, specific values to perfectly stage those exact scenarios.

### 8) In temporal projection, do flights calculate where they will be for every milli-second or in intervals?
**They calculate in intervals to save computing power.**
Checking every single millisecond would crash the computer. Instead, the simulation uses discrete lookahead samples: **0, 2, 4, 6, and 8 seconds into the future**. The AI basically asks: "Where will I be in exactly 2 seconds? Where will he be in 2 seconds? Are those two points closer than 34 NM?" It repeats this for the 4s, 6s, and 8s marks.

### 9) Why are the formulas formulated the way they are?
The formulas use specific numbers to perfectly balance the simulation:
* **Priority Score = `Fuel Urgency` + `0.4 * PriorityWeight`**
  * *Reasoning:* Fuel urgency is calculated so that it can be worth up to 60 points. The PriorityWeight (mission importance) is scaled by 0.4 so it's worth up to 40 points. This means a plane that is literally running out of fuel (60 points) will *always* win a negotiation against a fully fueled VIP flight (40 points). Safety always beats VIP status.
* **Avoidance Penalty = `(PenaltyRadius - Distance) * 14`**
  * *Reasoning:* When A* calculates a detour around a red hazard point, we add an artificial math penalty to routes that go near it. Multiplying by 14 creates a steep "repulsive forcefield." The closer a path gets to the collision point, the exponentially higher the math cost becomes, forcing the algorithm to choose a wider, safer arc around the danger.

### 10) Sometimes I see multiple red collision warnings for two flights. Is this a mis-insight, or is it supposed to happen?
**This is exactly what is supposed to happen!**
Remember the temporal projection from Question 8? Because planes check the 2s, 4s, 6s, and 8s marks in the future, two planes that are flying towards each other might trigger a collision warning at the 4-second future mark, AND they might still be too close at the 6-second future mark. The system draws a red hazard dot for *every single future timestamp* where they will be too close. The AI then looks at that cluster of red dots and draws a detour around the entire group of them.
