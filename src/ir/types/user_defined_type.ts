import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class UserDefinedType extends Type {
    constructor(
        src: BaseSrc,
        public readonly name: string,
        public readonly memArgs: string[],
        public readonly typeArgs: Type[]
    ) {
        super(src);
    }

    pp(): string {
        const memStr = this.memArgs.length > 0 ? `[${this.memArgs.join(", ")}]` : "";
        const typStr =
            this.typeArgs.length > 0 ? `<${this.typeArgs.map((x) => x.pp()).join(", ")}>` : "";

        return `${this.name}${memStr}${typStr}`;
    }

    getStructId(): any {
        return [this.name, ...this.memArgs, ...this.typeArgs.map((x) => x.getStructId())];
    }

    children(): Iterable<Node> {
        return this.typeArgs;
    }
}
