import { Node } from "../node";
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
    | "!=";

export class BinaryOperation<SrcT> extends Expression<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly leftExpr: Expression<SrcT>,
        public readonly op: BinaryOperator,
        public readonly rightExpr: Expression<SrcT>
    ) {
        super(id, src);
    }

    pp(): string {
        return `(${this.leftExpr.pp()} ${this.op} ${this.rightExpr.pp()})`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node<SrcT>> {
        return [this.leftExpr, this.rightExpr];
    }
}
