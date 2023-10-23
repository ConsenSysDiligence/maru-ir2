import { TransformerF, transform } from "../copy";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";

export class VariableDeclaration extends Node {
    constructor(
        src: BaseSrc,
        public readonly name: string,
        public readonly type: Type
    ) {
        super(src);
    }

    pp(): string {
        return `${this.name}: ${this.type.pp()}`;
    }

    getStructId(): any {
        return [this.name, this.type.getStructId()];
    }

    children(): Iterable<Node> {
        return [this.type];
    }

    copy(t: TransformerF | undefined): VariableDeclaration {
        return new VariableDeclaration(this.src, this.name, transform(this.type, t));
    }
}
