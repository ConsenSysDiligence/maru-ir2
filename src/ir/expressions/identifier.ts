import { Expression } from "./expression";
import { Node } from "../node";
import { BaseSrc } from "../source";

export class Identifier extends Expression {
    constructor(id: number, src: BaseSrc, public readonly name: string) {
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
}
