# Wumpus World Knowledge-Based Agent

## Overview

This project implements a **Knowledge-Based Agent** that navigates a Wumpus World grid using **Propositional Logic** and **Resolution Refutation**.

The agent does not know the environment initially and must infer safe cells using logical reasoning.

---

## Features

* Dynamic Grid (User-defined rows & columns)
* Random Placement of:

  * Pits
  * Wumpus
  * Gold
* Real-time Percepts:

  * Breeze (near pit)
  * Stench (near Wumpus)
* Knowledge Base (KB)
* Resolution Refutation Algorithm
* Automatic Pathfinding Agent
* Web Visualization (Vanilla JavaScript)

---

## Logic Used

### Propositional Symbols

* P(r,c) → Pit at cell
* W(r,c) → Wumpus at cell
* B(r,c) → Breeze
* S(r,c) → Stench

### Example Rule

B(1,1) → P(1,2) ∨ P(2,1)

### Resolution

To prove a cell is safe:
¬P(r,c) ∧ ¬W(r,c)

We:

1. Add negation to KB
2. Try to derive contradiction
3. If contradiction found → SAFE

---

## Metrics

* Inference Steps
* Agent Moves
* KB Clauses
* Safe Cells Identified

---

## Tech Stack

* HTML
* CSS
* Vanilla JavaScript

---

## How to Run

1. Download project
2. Open `index.html` in browser

---

## Challenges Faced

* Implementing Resolution Refutation
* Managing CNF clauses
* Designing logical inference system
* Synchronizing UI with agent reasoning

---

## Author

Muhammad Hassan
