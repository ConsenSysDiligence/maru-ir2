import { TransformerFn, transform } from "../copy";
import { GlobalVarLiteral } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Definition } from "./definition";

export class GlobalVariable extends Definition {
    constructor(
        src: BaseSrc,
        public readonly name: string,
        public readonly type: Type,
        public readonly initialValue: GlobalVarLiteral
    ) {
        super(src);
    }

    pp(): string {
        return `var ${this.name}: ${this.type.pp()} = ${this.initialValue.pp()}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.type, this.initialValue];
    }

    copy(t: TransformerFn | undefined): GlobalVariable {
        return new GlobalVariable(
            this.src,
            this.name,
            transform(this.type, t),
            transform(this.initialValue, t)
        );
    }
}
