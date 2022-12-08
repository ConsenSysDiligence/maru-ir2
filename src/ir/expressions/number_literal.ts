import { Node } from "../node";
import { BaseSrc } from "../source";
import { IntType } from "../types";
import { Expression } from "./expression";

export class NumberLiteral extends Expression {
    constructor(
        src: BaseSrc,
        public readonly value: bigint,
        public readonly radix: number,
        public readonly type: IntType
    ) {
        super(src);
    }

    pp(): string {
        return `${this.type.pp()}(${this.value.toString(this.radix)})`;
    }

    getStructId(): any {
        return [this.type, this.radix, this.value];
    }

    children(): Iterable<Node> {
        return [];
    }
}
