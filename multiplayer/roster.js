// In-memory room authorization rules. The trusted Worker supplies owner IDs
// from Supabase Auth, not from client payloads.
const id = () => crypto.randomUUID();
export class PrivateRoomRoster {
  constructor(owners = []) {
    this.owners = [...owners];
    this.tickets = new Map();
    if (this.owners.length > 2 || new Set(this.owners).size !== this.owners.length) {
      throw new Error('Invalid room owners');
    }
  }
  add(owner) {
    if (typeof owner !== 'string' || !/^[0-9a-f-]{36}$/i.test(owner)) throw new Error('Unauthorized');
    const existing = this.owners.indexOf(owner);
    if (existing >= 0) return existing;
    if (this.owners.length >= 2) throw new Error('Room full');
    this.owners.push(owner);
    return this.owners.length - 1;
  }
  ticket(owner, now = Date.now()) {
    const slot = this.owners.indexOf(owner);
    if (slot < 0) throw new Error('Not a room member');
    const token = id() + id();
    this.tickets.set(token, {slot,expires:now+60_000});
    if (this.tickets.size > 12) {
      for (const [k,v] of this.tickets) if(v.expires<=now) this.tickets.delete(k);
      while(this.tickets.size>12) this.tickets.delete(this.tickets.keys().next().value);
    }
    return token;
  }
  consume(token, now = Date.now()) {
    if (typeof token !== 'string') return -1;
    const t = this.tickets.get(token);
    if (!t) return -1;
    this.tickets.delete(token);
    return now < t.expires ? t.slot : -1;
  }
}
