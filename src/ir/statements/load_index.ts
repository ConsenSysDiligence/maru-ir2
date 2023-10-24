import { TransformerFn, transform } from "../copy";
import { Expression, Identifier } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Statement } from "./statement";

export class LoadIndex extends Statement {
    constructor(
        src: BaseSrc,
        public readonly lhs: Identifier,
        public readonly baseExpr: Expression,
        public readonly indexExpr: Expression
    ) {
        super(src);
    }

    pp(): string {
        return `load ${this.baseExpr.pp()}[${this.indexExpr.pp()}] in ${this.lhs.pp()};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.lhs, this.baseExpr, this.indexExpr];
    }

    copy(t: TransformerFn | undefined): LoadIndex {
        return new LoadIndex(
            this.src,
            transform(this.lhs, t),
            transform(this.baseExpr, t),
            transform(this.indexExpr, t)
        );
    }
}
