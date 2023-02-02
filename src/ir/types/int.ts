import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class IntType extends Type {
    public readonly signed: boolean;
    public readonly nbits: number;

    constructor(src: BaseSrc, nbits: number, signed: boolean) {
        super(src);

        this.signed = signed;
        this.nbits = nbits;
    }

    pp(): string {
        return `${this.signed ? "i" : "u"}${this.nbits}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [];
    }

    limits(): [bigint, bigint] {
        return this.signed
            ? [-1n << BigInt(this.nbits - 1), (1n << BigInt(this.nbits - 1)) - 1n]
            : [0n, (1n << BigInt(this.nbits)) - 1n];
    }

    fits(value: bigint): boolean {
        const [min, max] = this.limits();

        return min <= value && value <= max;
    }
}
