import { TransformerF, transform } from "../copy";
import { Expression } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Statement } from "./statement";

export class StoreIndex extends Statement {
    constructor(
        src: BaseSrc,
        public readonly baseExpr: Expression,
        public readonly indexExpr: Expression,
        public readonly rhs: Expression
    ) {
        super(src);
    }

    pp(): string {
        return `store ${this.rhs.pp()} in ${this.baseExpr.pp()}[${this.indexExpr.pp()}];`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.baseExpr, this.indexExpr, this.rhs];
    }

    copy(t: TransformerF | undefined): StoreIndex {
        return new StoreIndex(
            this.src,
            transform(this.baseExpr, t),
            transform(this.indexExpr, t),
            transform(this.rhs, t)
        );
    }
}
