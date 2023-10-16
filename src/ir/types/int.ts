import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class IntType extends Type {
    constructor(
        src: BaseSrc,
        public readonly nbits: number,
        public readonly signed: boolean
    ) {
        super(src);
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

    copy(): IntType {
        return new IntType(this.src, this.nbits, this.signed);
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
