import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class TypeVar extends Type {
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
