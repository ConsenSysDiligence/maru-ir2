import { TransformerF, transform } from "../copy";
import { Expression, Identifier } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Statement } from "./statement";

export class Assignment extends Statement {
    constructor(
        src: BaseSrc,
        public readonly lhs: Identifier,
        public readonly rhs: Expression
    ) {
        super(src);
    }

    pp(): string {
        return `${this.lhs.pp()} := ${this.rhs.pp()};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.lhs, this.rhs];
    }

    copy(t: TransformerF | undefined): Assignment {
        return new Assignment(this.src, transform(this.lhs, t), transform(this.rhs, t));
    }
}
