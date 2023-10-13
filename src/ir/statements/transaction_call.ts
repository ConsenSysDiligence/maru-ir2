import { ppPolyArgs } from "../../utils";
import { copy } from "../copy";
import { Expression, Identifier } from "../expressions";
import { MemDesc } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Statement } from "./statement";

export class TransactionCall extends Statement {
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

        return `${lhsStr}trans_call ${this.callee.pp()}${ppPolyArgs(
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

    copy(): TransactionCall {
        return new TransactionCall(
            this.src,
            this.lhss.map(copy),
            this.callee.copy(),
            this.memArgs.map(copy),
            this.typeArgs.map(copy),
            this.args.map(copy)
        );
    }
}
