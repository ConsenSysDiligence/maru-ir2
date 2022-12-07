import { Expression } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Statement } from "./statement";

export class StoreField extends Statement {
    constructor(
        src: BaseSrc,
        public readonly baseExpr: Expression,
        public readonly member: string,
        public readonly rhs: Expression
    ) {
        super(src);
    }

    pp(): string {
        return `store ${this.rhs.pp()} in ${this.baseExpr.pp()}.${this.member};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.baseExpr, this.rhs];
    }
}
