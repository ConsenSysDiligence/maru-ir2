import { TransformerFn, transform } from "../copy";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Expression } from "./expression";

export type UnaryOperator = "-" | "!" | "~";

export class UnaryOperation extends Expression {
    constructor(
        src: BaseSrc,
        public readonly op: UnaryOperator,
        public readonly subExpr: Expression
    ) {
        super(src);
    }

    pp(): string {
        return `${this.op}(${this.subExpr.pp()})`;
    }

    getStructId(): any {
        return [this.op, this.subExpr];
    }

    children(): Iterable<Node> {
        return [this.subExpr];
    }

    copy(t: TransformerFn | undefined): UnaryOperation {
        return new UnaryOperation(this.src, this.op, transform(this.subExpr, t));
    }
}
