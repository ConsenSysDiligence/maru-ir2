import { Node } from "../node";
import { BaseSrc } from "../source";
import { Expression } from "./expression";

export type BinaryOperator =
    | "**"
    | "*"
    | "/"
    | "%"
    | "+"
    | "-"
    | ">>"
    | "<<"
    | "&"
    | "|"
    | "^"
    | "<"
    | ">"
    | "<="
    | ">="
    | "=="
    | "!="
    | "&&"
    | "||";

export class BinaryOperation extends Expression {
    constructor(
        src: BaseSrc,
        public readonly leftExpr: Expression,
        public readonly op: BinaryOperator,
        public readonly rightExpr: Expression
    ) {
        super(src);
    }

    pp(): string {
        return `(${this.leftExpr.pp()} ${this.op} ${this.rightExpr.pp()})`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.leftExpr, this.rightExpr];
    }

    copy(): BinaryOperation {
        return new BinaryOperation(this.src, this.leftExpr.copy(), this.op, this.rightExpr.copy());
    }
}
