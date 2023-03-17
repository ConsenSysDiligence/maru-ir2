import { Expression, Identifier } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Statement } from "./statement";

export class Contains extends Statement {
    constructor(
        src: BaseSrc,
        public readonly lhs: Identifier,
        public readonly baseExpr: Expression,
        public readonly keyExpr: Expression
    ) {
        super(src);
    }

    pp(): string {
        return `${this.lhs.pp()} := ${this.baseExpr.pp()} contains ${this.keyExpr.pp()};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.lhs, this.baseExpr, this.keyExpr];
    }
}
