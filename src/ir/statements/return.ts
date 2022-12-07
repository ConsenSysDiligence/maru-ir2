import { Expression } from "../expressions";
import { Node } from "../node";
import { TerminatorStmt } from "./terminator";

export class Return<SrcT> extends TerminatorStmt<SrcT> {
    constructor(id: number, src: SrcT, public readonly values: Array<Expression<SrcT>>) {
        super(id, src);
    }

    pp(): string {
        if (this.values.length === 0) {
            return "return ;";
        }

        if (this.values.length === 1) {
            return `return ${this.values[0].pp()};`;
        }

        return `return (${this.values.map((v) => v.pp()).join(", ")});`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node<SrcT>> {
        return this.values;
    }
}
