import { Node } from "../node";
import { Type } from "./type";

export class UserDefinedType<SrcT> extends Type<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly name: string,
        public readonly memArgs: string[],
        public readonly typeArgs: Array<Type<SrcT>>
    ) {
        super(id, src);
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

    children(): Iterable<Node<SrcT>> {
        return this.typeArgs;
    }
}
