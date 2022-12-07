import { Node } from "../node";
import { BaseSrc } from "../source";
import { Expression } from "./expression";

export class NumberLiteral extends Expression {
    constructor(src: BaseSrc, public readonly value: bigint, public readonly radix: number) {
        super(src);
    }

    pp(): string {
        return this.value.toString(this.radix);
    }

    getStructId(): any {
        return [this.radix, this.value];
    }

    children(): Iterable<Node> {
        return [];
    }
}
