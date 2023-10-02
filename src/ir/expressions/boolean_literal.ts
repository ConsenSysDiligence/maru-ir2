import { Node } from "../node";
import { BaseSrc } from "../source";
import { Expression } from "./expression";

export class BooleanLiteral extends Expression {
    constructor(
        src: BaseSrc,
        public readonly value: boolean
    ) {
        super(src);
    }

    pp(): string {
        return `${this.value}`;
    }

    getStructId(): any {
        return this.value;
    }

    children(): Iterable<Node> {
        return [];
    }
}
