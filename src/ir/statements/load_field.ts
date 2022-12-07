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
        return `${this.lhs.pp()} := load ${this.baseExpr.pp()}.${this.member};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.lhs, this.baseExpr];
    }
}
