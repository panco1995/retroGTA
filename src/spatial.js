// The world keeps every collider in one flat list, but most of them never
// move: buildings, street props, the kerbs, the island edge. Those go into a
// uniform grid over the XZ plane, so a query only has to look at the cells
// around the point it cares about instead of the whole list.
//
// Anything that does move stays in a short list that is always tested. A
// moving body would leave a stale entry behind in the grid, and a car that
// has just been knocked into a wall is exactly the case where a missed
// collider shows up as a car driving through a lamp post.

const CELL = 4;

// One number per cell so the grid is a plain Map with integer keys. The
// island is far smaller than 16 bits per axis.
function cellKey(cx, cz) {
  return (cx & 0xffff) * 65536 + (cz & 0xffff);
}

// The ground footprint of a collider. Circles and oriented boxes get their
// real extent; plain boxes already carry it.
export function colliderBounds(c) {
  if (c.circle) {
    return {
      minX: c.x - c.radius,
      maxX: c.x + c.radius,
      minZ: c.z - c.radius,
      maxZ: c.z + c.radius,
    };
  }
  if (c.obb) {
    const s = Math.abs(Math.sin(c.heading));
    const cos = Math.abs(Math.cos(c.heading));
    const hx = c.halfL * s + c.halfW * cos;
    const hz = c.halfL * cos + c.halfW * s;
    return {
      minX: c.x - hx,
      maxX: c.x + hx,
      minZ: c.z - hz,
      maxZ: c.z + hz,
    };
  }
  return c;
}

// A collider list with a spatial index behind it. It behaves like the plain
// array it replaces: it can be pushed to, spliced, indexed and iterated.
export class ColliderList extends Array {
  // Array methods such as filter() must hand back plain arrays. A copy would
  // carry colliders without the index that makes them findable.
  static get [Symbol.species]() {
    return Array;
  }

  constructor(items = []) {
    super();
    this._cells = new Map();
    this._where = new Map();
    this._moving = [];
    this._regions = [];
    this._near = [];
    this._marks = new Map();
    this._stamp = 0;
    for (const item of items) this.push(item);
  }

  push(...items) {
    const size = super.push(...items);
    for (const item of items) this._add(item);
    return size;
  }

  pop() {
    const item = super.pop();
    if (item !== undefined) this._drop(item);
    return item;
  }

  shift() {
    const item = super.shift();
    if (item !== undefined) this._drop(item);
    return item;
  }

  splice(start, deleteCount, ...items) {
    const removed = deleteCount === undefined && items.length === 0
      ? super.splice(start)
      : super.splice(start, deleteCount === undefined ? 0 : deleteCount, ...items);
    for (const item of removed) this._drop(item);
    for (const item of items) this._add(item);
    return removed;
  }

  // Takes a collider out of the index. It stays in the list itself, so the
  // caller can put it back later, but nothing finds it any more.
  hide(c) {
    this._drop(c);
  }

  // Puts a hidden collider back into the index, at the place it is now. A
  // collider that is still on the move goes on the always-tested list
  // instead of into a cell, because a cell remembers where a collider was put
  // and a prop that is in the air right now will be somewhere else next frame.
  restore(c, moving = false) {
    this._drop(c);
    c.moving = !!moving;
    this._add(c);
  }

  // The colliders that could touch a circle at (x, z). The returned array is
  // reused between calls, so consume it before asking again.
  near(x, z, radius) {
    const out = this._near;
    out.length = 0;
    const stamp = (this._stamp += 1);
    const cx0 = Math.floor((x - radius) / CELL);
    const cx1 = Math.floor((x + radius) / CELL);
    const cz0 = Math.floor((z - radius) / CELL);
    const cz1 = Math.floor((z + radius) / CELL);
    for (let cz = cz0; cz <= cz1; cz += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const bucket = this._cells.get(cellKey(cx, cz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 1) {
          const c = bucket[i];
          if (this._marks.get(c) === stamp) continue;
          this._marks.set(c, stamp);
          out.push(c);
        }
      }
    }
    for (let i = 0; i < this._moving.length; i += 1) out.push(this._moving[i]);
    for (let i = 0; i < this._regions.length; i += 1) out.push(this._regions[i]);
    return out;
  }

  _add(c) {
    // A region is a rule, not an obstacle: it has to be checked everywhere.
    if (c.keepInside) {
      this._regions.push(c);
      return;
    }
    if (c.moving) {
      this._moving.push(c);
      return;
    }
    const b = colliderBounds(c);
    const keys = [];
    const cx0 = Math.floor(b.minX / CELL);
    const cx1 = Math.floor(b.maxX / CELL);
    const cz0 = Math.floor(b.minZ / CELL);
    const cz1 = Math.floor(b.maxZ / CELL);
    for (let cz = cz0; cz <= cz1; cz += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const key = cellKey(cx, cz);
        keys.push(key);
        let bucket = this._cells.get(key);
        if (!bucket) {
          bucket = [];
          this._cells.set(key, bucket);
        }
        bucket.push(c);
      }
    }
    this._where.set(c, keys);
  }

  _drop(c) {
    const region = this._regions.indexOf(c);
    if (region >= 0) {
      this._regions.splice(region, 1);
      return;
    }
    const moving = this._moving.indexOf(c);
    if (moving >= 0) {
      this._moving.splice(moving, 1);
      return;
    }
    const keys = this._where.get(c);
    if (!keys) return;
    for (const key of keys) {
      const bucket = this._cells.get(key);
      if (!bucket) continue;
      const at = bucket.indexOf(c);
      if (at >= 0) bucket.splice(at, 1);
      if (bucket.length === 0) this._cells.delete(key);
    }
    this._where.delete(c);
  }
}
