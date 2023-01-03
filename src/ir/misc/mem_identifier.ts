import { Node } from "../node";
import { BaseSrc } from "../source";

export class MemIdentifier extends Node {
    constructor(src: BaseSrc, public readonly name: string, public readonly out: boolean) {
        super(src);
    }

    pp(): string {
        return this.out ? `out ${this.name}` : this.name;
    }

    getStructId(): any {
        return [this.out, this.name];
    }

    children(): Iterable<Node> {
        return [];
    }
}
