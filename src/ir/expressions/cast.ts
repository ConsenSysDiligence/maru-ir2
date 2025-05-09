import { TransformerFn, transform } from "../copy";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Expression } from "./expression";

export class Cast extends Expression {
    constructor(
        src: BaseSrc,
        public readonly toType: Type,
        public readonly subExpr: Expression
    ) {
        super(src);
    }

    pp(): string {
        return `${this.toType.pp()}(${this.subExpr.pp()})`;
    }

    getStructId(): any {
        return [this.toType, this.subExpr];
    }

    children(): Iterable<Node> {
        return [this.toType, this.subExpr];
    }

    copy(t: TransformerFn | undefined): Cast {
        return new Cast(this.src, transform(this.toType, t), transform(this.subExpr, t));
    }
}
