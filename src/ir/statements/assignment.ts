import { Expression, Identifier } from "../expressions";
import { Node } from "../node";
import { Statement } from "./statement";

export class Assignment<SrcT> extends Statement<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly lhs: Identifier<SrcT>,
        public readonly rhs: Expression<SrcT>
    ) {
        super(id, src);
    }

    pp(): string {
        return `${this.lhs.pp()} := ${this.rhs.pp()};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node<SrcT>> {
        return [this.lhs, this.rhs];
    }
}
