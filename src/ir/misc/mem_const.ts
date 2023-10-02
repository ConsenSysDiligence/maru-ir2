import { Node } from "../node";
import { BaseSrc } from "../source";
import { MemIdentifier } from "./mem_identifier";

export type MemDesc = MemConstant | MemIdentifier;

export class MemConstant extends Node {
    constructor(
        src: BaseSrc,
        public readonly name: string
    ) {
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
