import { ppPolyArgs } from "../../utils";
import { TransformerF, transform } from "../copy";
import { Expression, Identifier } from "../expressions";
import { MemDesc } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Statement } from "./statement";

export class FunctionCall extends Statement {
    constructor(
        src: BaseSrc,
        public readonly lhss: Identifier[],
        public readonly callee: Identifier,
        public readonly memArgs: MemDesc[],
        public readonly typeArgs: Type[],
        public readonly args: Expression[]
    ) {
        super(src);
    }

    pp(): string {
        const lhsStr = this.lhss.length > 0 ? `${this.lhss.map((x) => x.pp()).join(", ")} := ` : ``;

        return `${lhsStr}call ${this.callee.pp()}${ppPolyArgs(
            this.memArgs,
            this.typeArgs
        )}(${this.args.map((x) => x.pp()).join(", ")});`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [...this.lhss, ...this.memArgs, ...this.typeArgs, this.callee, ...this.args];
    }

    copy(t: TransformerF | undefined): FunctionCall {
        return new FunctionCall(
            this.src,
            this.lhss.map((lhs) => transform(lhs, t)),
            transform(this.callee, t),
            this.memArgs.map((mArg) => transform(mArg, t)),
            this.typeArgs.map((tArg) => transform(tArg, t)),
            this.args.map((arg) => transform(arg, t))
        );
    }
}
