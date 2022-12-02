import { Type } from "./type";

export class IntType<SrcT> extends Type<SrcT> {
    public readonly signed: boolean;
    public readonly nbits: number;

    constructor(id: number, src: SrcT, nbits: number, signed: boolean) {
        super(id, src);

        this.signed = signed;
        this.nbits = nbits;
    }

    pp(): string {
        return `${this.signed ? "" : "u"}int${this.nbits}`;
    }

    getStructId(): any {
        return this.pp();
    }
}
