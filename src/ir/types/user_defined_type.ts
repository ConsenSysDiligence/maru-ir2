import { Identifier } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class UserDefinedType extends Type {
    constructor(src: BaseSrc, public readonly name: string, public readonly memArgs: Identifier[]) {
        super(src);
    }

    pp(): string {
        const memStr =
            this.memArgs.length > 0 ? `<${this.memArgs.map((x) => x.pp()).join(", ")}>` : "";

        return `${this.name}${memStr}`;
    }

    getStructId(): any {
        return [this.name, ...this.memArgs];
    }

    children(): Iterable<Node> {
        return this.memArgs;
    }
}
