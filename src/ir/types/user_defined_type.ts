import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class UserDefinedType extends Type {
    constructor(src: BaseSrc, public readonly name: string, public readonly memArgs: string[]) {
        super(src);
    }

    pp(): string {
        const memStr = this.memArgs.length > 0 ? `<${this.memArgs.join(", ")}>` : "";
        return `${this.name}${memStr}`;
    }

    getStructId(): any {
        return [this.name, ...this.memArgs];
    }

    children(): Iterable<Node> {
        return [];
    }
}
