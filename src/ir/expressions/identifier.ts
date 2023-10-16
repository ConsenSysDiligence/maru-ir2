import { Expression } from "./expression";
import { Node } from "../node";
import { BaseSrc } from "../source";

export class Identifier extends Expression {
    constructor(
        src: BaseSrc,
        public readonly name: string
    ) {
        super(src);
    }

    pp(): string {
        return this.name;
    }

    getStructId(): any {
        return this.name;
    }

    children(): Iterable<Node> {
        return [];
    }

    copy(): Identifier {
        return new Identifier(this.src, this.name);
    }
}
