import { Node } from "../node";
import { BaseSrc } from "../source";

export class MemIdentifier extends Node {
    constructor(src: BaseSrc, public readonly name: string) {
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
