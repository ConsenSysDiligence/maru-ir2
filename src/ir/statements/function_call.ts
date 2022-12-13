import { Expression, Identifier } from "../expressions";
import { MemDesc } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Statement } from "./statement";

export class FunctionCall extends Statement {
    constructor(
        src: BaseSrc,
        public readonly lhss: Identifier[],
        public readonly callee: Identifier,
        public readonly memArgs: MemDesc[],
        public readonly args: Expression[]
    ) {
        super(src);
    }

    pp(): string {
        const memArgsStr =
            this.memArgs.length > 0 ? `<${this.memArgs.map((x) => x.pp()).join(", ")}>` : "";

        const lhsStr = this.lhss.length > 0 ? `${this.lhss.map((x) => x.pp()).join(", ")} := ` : ``;

        return `${lhsStr}call ${this.callee.pp()}${memArgsStr}(${this.args
            .map((x) => x.pp())
            .join(", ")});`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [...this.lhss, this.callee, ...this.args];
    }
}
