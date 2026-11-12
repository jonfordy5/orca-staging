# M1-02A — ORCA Legends private 1v1: authoritative core

**Status:** isolated implementation in draft PR; no online match server, no staging DB changes, no merge or deployment.

## What exists now

- `game/pvp-authority.js` defines a **trusted-server-only** 20 Hz fixed-step combat reducer.
- Each slot is mapped once to an opaque, distinct **server-authenticated account owner**, not to client-supplied user IDs.
- Browser inputs are restricted to monotonically sequenced movement vectors, direction, block intent, and one attack/dodge/spell intent per server tick.
- The trusted simulation owns movement speed/bounds, ability costs/cooldowns, facing/range, block/dodge, hit points, forfeit and victory.
- `publicSnapshot()` exposes the match result/visual state but not private owner IDs or input fields.
- Tests exercise invalid input, owner distinctness, authoritative movement/damage, defense, result immutability, disconnections and snapshot privacy.

## Design limitation (important)

This reducer **does not authenticate any user**, implement a network protocol, resolve cheating via a real transport, or render a second character. The server adapter is mandatory before a genuine multiplayer test. Clients must never import this reducer to decide real damage/positions. The existing Vault remains a separate single-player experience until a reviewed bridge is ready.

The current impact model is an intentionally simplified instantaneous hit, not a replacement for the existing Vault's polished animation timing. Before integrating into the arena, adapt the combat state machine to the accepted strike anticipation/impact/recovery windows and Cinderbolt projectile timing. Verify client-side animation reconciliation without allowing clients to determine hits or victory.

## M1-02B proposed trusted transport boundary

1. User signs in using existing ORCA staging Supabase Auth; the match service validates the user's identity with Supabase **server-side**. Never log tokens or accept a client-supplied slot/owner ID as authority.
2. Before creating or joining a private room, verify the **same authenticated principal** qualifies via the existing `orca_legends_access()` contract (or equivalent server-side, self-scoped read). Verify only two *different* eligible owners can occupy seats.
3. Use a short-lived, one-use invitation **code** to find the room; the code is not authentication or permission. Limit room count/duration, join attempts and input frequency. No public matchmaking.
4. Connections submit `{seq,mx,mz,yaw,block,action}` only. The server maps each connection to a private slot, calls `receiveInput`, advances `stepMatch` on a trusted clock, and broadcasts bounded `publicSnapshot` state. Do not trust browser damage, health, timestamps, room results or prices.
5. Secure reconnect authenticates the same owner, atomically replaces the old connection and resumes the same seat before the disconnect grace deadline. On last disconnect, expire the room without declaring a fabricated winner. Abandoned rooms and participant slots are cleaned up.
6. Server publishes a final immutable per-match result that both connected players receive. Replays/rematches create fresh match IDs and fresh eligibility checks. No rewards or betting.
7. Add two-browser independent-account integration tests; malformed inputs, stale sequence, unauthorized room entry, attacker spoofing, duplicated sessions, and disconnect edges must fail closed.
8. Measure bandwidth, server tick latency, memory and service costs. A specific supported trusted runtime (e.g., dedicated WebSocket server) must be chosen before implementation. **Supabase Realtime Broadcast alone is not a trusted combat referee.** A managed database can store verified results; it should not be used as an unvalidated client-authoritative game loop.

## Release gate

No staging deployment or permission change until the owner reviews the multiplayer transport, the previously flagged excessive table privileges receive a separate security assessment, and the team agrees on costs and test access. Preserve the original Vault, research pages, participant consent, independent research data and existing single-player loot.
