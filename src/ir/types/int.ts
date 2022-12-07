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
        return `${this.signed ? "" : "u"}int${this.nbits}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [];
    }
}
