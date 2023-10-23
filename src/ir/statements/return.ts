import { TransformerF, transform } from "../copy";
import { Expression } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { TerminatorStmt } from "./terminator";

export class Return extends TerminatorStmt {
    constructor(
        src: BaseSrc,
        public readonly values: Expression[]
    ) {
        super(src);
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

    children(): Iterable<Node> {
        return this.values;
    }

    copy(t: TransformerF | undefined): Return {
        return new Return(
            this.src,
            this.values.map((v) => transform(v, t))
        );
    }
}
