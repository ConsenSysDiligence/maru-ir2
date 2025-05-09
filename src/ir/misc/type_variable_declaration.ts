import { Node } from "../node";
import { BaseSrc } from "../source";

export class TypeVariableDeclaration extends Node {
    constructor(
        src: BaseSrc,
        public readonly name: string
    ) {
        super(src);
    }

    pp(): string {
        return `${this.name}`;
    }

    getStructId(): any {
        return this.name;
    }

    children(): Iterable<Node> {
        return [];
    }

    copy(): TypeVariableDeclaration {
        return new TypeVariableDeclaration(this.src, this.name);
    }
}
