import { Expression } from "../expressions";
import { Node } from "../node";
import { TerminatorStmt } from "./terminator";

export class Branch<SrcT> extends TerminatorStmt<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly condition: Expression<SrcT>,
        public readonly trueLabel: string,
        public readonly falseLabel: string
    ) {
        super(id, src);
    }

    pp(): string {
        return `branch ${this.condition.pp()} ${this.trueLabel} ${this.falseLabel};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node<SrcT>> {
        return [this.condition];
    }
}
