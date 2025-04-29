import { TransformerFn, transform } from "../copy";
import { Expression, Identifier } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Statement } from "./statement";

export class LoadField extends Statement {
    constructor(
        src: BaseSrc,
        public readonly lhs: Identifier,
        public readonly baseExpr: Expression,
        public readonly member: string
    ) {
        super(src);
    }

    pp(): string {
        return `load ${this.baseExpr.pp()}.${this.member} in ${this.lhs.pp()};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.lhs, this.baseExpr];
    }

    copy(t: TransformerFn | undefined): LoadField {
        return new LoadField(
            this.src,
            transform(this.lhs, t),
            transform(this.baseExpr, t),
            this.member
        );
    }
}
