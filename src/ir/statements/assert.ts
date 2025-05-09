import { TransformerFn, transform } from "../copy";
import { Expression } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Statement } from "./statement";

export class Assert extends Statement {
    constructor(
        src: BaseSrc,
        public readonly condition: Expression
    ) {
        super(src);
    }

    pp(): string {
        return `assert ${this.condition.pp()};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.condition];
    }

    copy(t: TransformerFn | undefined): Assert {
        return new Assert(this.src, transform(this.condition, t));
    }
}
