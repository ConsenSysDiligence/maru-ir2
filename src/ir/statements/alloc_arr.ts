import { Expression, Identifier } from "../expressions";
import { MemDesc } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Statement } from "./statement";

export class AllocArray extends Statement {
    constructor(
        src: BaseSrc,
        public readonly lhs: Identifier,
        public readonly type: Type,
        public readonly size: Expression,
        public readonly mem: MemDesc
    ) {
        super(src);
    }

    pp(): string {
        return `${this.lhs.pp()} := alloc ${this.type.pp()}[${this.size.pp()}] in ${this.mem.pp()};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.lhs, this.type, this.size, this.mem];
    }
}
