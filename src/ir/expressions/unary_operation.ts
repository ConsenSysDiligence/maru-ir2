import { Node } from "../node";
import { Expression } from "./expression";

export type UnaryOperator = "-" | "!";

export class UnaryOperation<SrcT> extends Expression<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly op: UnaryOperator,
        public readonly subExpr: Expression<SrcT>
    ) {
        super(id, src);
    }

    pp(): string {
        return `${this.op}(${this.subExpr.pp()})`;
    }

    getStructId(): any {
        return [this.op, this.subExpr];
    }

    children(): Iterable<Node<SrcT>> {
        return [this.subExpr];
    }
}
