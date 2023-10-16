import { Expression } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { TerminatorStmt } from "./terminator";

export class Branch extends TerminatorStmt {
    constructor(
        src: BaseSrc,
        public readonly condition: Expression,
        public readonly trueLabel: string,
        public readonly falseLabel: string
    ) {
        super(src);
    }

    pp(): string {
        return `branch ${this.condition.pp()} ${this.trueLabel} ${this.falseLabel};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.condition];
    }

    copy(): Branch {
        return new Branch(this.src, this.condition.copy(), this.trueLabel, this.falseLabel);
    }
}
