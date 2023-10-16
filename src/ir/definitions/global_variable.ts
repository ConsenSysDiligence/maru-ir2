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

    copy(): GlobalVariable {
        return new GlobalVariable(this.src, this.name, this.type.copy(), this.initialValue.copy());
    }
}
