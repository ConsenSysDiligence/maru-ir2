import { Expression, Identifier } from "../expressions";
import { Node } from "../node";
import { Statement } from "./statement";

export class LoadIndex<SrcT> extends Statement<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly lhs: Identifier<SrcT>,
        public readonly baseExpr: Expression<SrcT>,
        public readonly indexExpr: Expression<SrcT>
    ) {
        super(id, src);
    }

    pp(): string {
        return `${this.lhs.pp()} := load ${this.baseExpr.pp()}[${this.indexExpr.pp()}];`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node<SrcT>> {
        return [this.lhs, this.baseExpr, this.indexExpr];
    }
}
