/** Append-only typed arrays that double their capacity, so streaming large models stays O(n). */
export class GrowableF32 {
  private data: Float32Array;
  length = 0;
  constructor(initial = 1 << 16) {
    this.data = new Float32Array(initial);
  }
  reserve(extra: number): void {
    const need = this.length + extra;
    if (need <= this.data.length) return;
    let cap = this.data.length;
    while (cap < need) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  push(v: number): void {
    if (this.length === this.data.length) this.reserve(1);
    this.data[this.length++] = v;
  }
  /** A right-sized copy (transferable to the main thread). */
  toArray(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

export class GrowableU32 {
  private data: Uint32Array;
  length = 0;
  constructor(initial = 1 << 16) {
    this.data = new Uint32Array(initial);
  }
  reserve(extra: number): void {
    const need = this.length + extra;
    if (need <= this.data.length) return;
    let cap = this.data.length;
    while (cap < need) cap *= 2;
    const next = new Uint32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  push(v: number): void {
    if (this.length === this.data.length) this.reserve(1);
    this.data[this.length++] = v;
  }
  toArray(): Uint32Array {
    return this.data.slice(0, this.length);
  }
}
