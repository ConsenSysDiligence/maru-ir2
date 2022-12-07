import { Expression } from "../expressions";
import { Node } from "../node";
import { Statement } from "./statement";

export class StoreField<SrcT> extends Statement<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly baseExpr: Expression<SrcT>,
        public readonly member: string,
        public readonly rhs: Expression<SrcT>
    ) {
        super(id, src);
    }

    pp(): string {
        return `store ${this.rhs.pp()} in ${this.baseExpr.pp()}.${this.member};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node<SrcT>> {
        return [this.baseExpr, this.rhs];
    }
}
