# Factory Floor Monitoring Dashboard — Problem Statement

**Duration:** 90 minutes
**Format:** Live coding session followed by a panel presentation

You have been given a starter project for a factory floor monitoring dashboard. The project includes a working dev server, mock data, pre-built data hooks, and a reference component. The README in the repo documents the technical setup.

> **AI tools are welcome.** Use whatever tools you normally use. We will ask you to explain your code, your decisions, and any tradeoffs in detail afterward.
>
> **Create a public GitHub repository** and commit your work as you go.
>
> **After this session**, you will present what you built to a panel of developers and product manager. They will review your repository and ask you questions about your implementation.

---

## Context

A factory floor has multiple **zones** (Assembly, Welding, Painting, Packaging). Each zone contains **machines** that report real-time telemetry and can raise **alerts** when something goes wrong. Factory operators use this dashboard to monitor the floor and respond to problems.

---

## What to Build

### 1. Factory Overview

The dashboard needs to give operators an at-a-glance view of the factory's current state — what's connected, what's healthy, and where to focus attention.

### 2. Active Problems

> *"Operators need a way to see and manage active problems across the factory floor. They should be able to quickly understand what's going wrong, where, and how severe it is. They also need to be able to acknowledge problems they're working on."*

### 3. Zone Health

Operators need to see the health of each factory zone and understand which areas need attention.

### 4. Real-Time Awareness *(if time permits)*

The factory floor is always changing. How should the dashboard reflect what's happening right now?

### 5. Factory Topology *(stretch goal)*

If all of the above is complete: build a visual layout of the factory floor showing zones and the machines within them.
