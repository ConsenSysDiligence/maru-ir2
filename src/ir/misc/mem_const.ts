import { Identifier } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";

export type MemDesc = MemConstant | Identifier;

export class MemConstant extends Node {
    constructor(src: BaseSrc, public readonly name: string) {
        super(src);
    }

    pp(): string {
        return `#${this.name}`;
    }

    getStructId(): any {
        return this.name;
    }

    children(): Iterable<Node> {
        return [];
    }
}
